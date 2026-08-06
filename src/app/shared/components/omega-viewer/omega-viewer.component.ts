import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, map, of, switchMap } from 'rxjs';

import { CreditCardService } from '@features/credit-card/services/credit-card.service';
import { PatchExpenseRequest } from '@features/expense/models/expense';
import { ExpenseService } from '@features/expense/services/expense.service';
import { TagService } from '@features/tag/services/tag.service';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';

import { OmegaViewerDetail } from './models/omega-viewer-detail';
import { OmegaViewerFieldRow, OmegaViewerRemainingBadge } from './models/omega-viewer-field-row';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { mapDetailToFieldRows, mapRemainingBadge } from './omega-viewer-field-mapper';
import { OmegaViewerService } from './omega-viewer.service';
import { ViewerDiscardConfirmDialogComponent } from './sections/viewer-discard-confirm-dialog.component';
import { ViewerEditFormComponent } from './sections/viewer-edit-form.component';
import { ViewerFieldListComponent } from './sections/viewer-field-list.component';

/** The Omega Viewer's edit mode (F-07) — scoped to whatever item is currently on screen.
 * Always resets to `'VIEW'` on any navigation (push or pop), never preserved across items. */
export type OmegaViewerMode = 'VIEW' | 'EDIT';

/** Discriminates the 3 outcomes `detailState` can be in at any point in time. */
type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly detail: OmegaViewerDetail };

/** Short human label for the item that just loaded, used both as the on-screen title and
 * the `aria-live` navigation announcement (F-11). */
function titleOf(detail: OmegaViewerDetail): string {
  switch (detail.kind) {
    case 'EXPENSE':
      return detail.name;
    case 'INSTALLMENT':
    case 'SUBSCRIPTION':
      return detail.description;
  }
}

/**
 * Omega Viewer shell — a modal that shows one item (Expense/Installment/Subscription) at
 * a time with page-flip navigation between linked items. F-05 delivered the navigable shell
 * (history stack, detail resolution, loading/error/retry). F-11 adds the link-navigation UI
 * (slide+fade page-flip, `prefers-reduced-motion` support, keyboard focus management,
 * `aria-live` announcements). F-12 adds the field-list body via `ViewerFieldListComponent`.
 * F-07 adds Expense edit mode (see below). No payments section (F-09) yet — that plugs into
 * this shell later.
 *
 * `OmegaViewerService` is provided here at component scope (`providers: [OmegaViewerService]`)
 * — it is modal view-state, not an app-lifetime singleton, so it must NOT be
 * `providedIn: 'root'` (would leak state/subscriptions across separate viewer sessions).
 *
 * Back always refetches — no caching across the stack (confirmed decision, see the Omega
 * Viewer README's decisions table). This keeps `history` a plain array of refs, never of
 * resolved details.
 *
 * F-07 adds Expense edit mode: a `mode` signal scoped to the current stack entry (always
 * reset to `'VIEW'` on any navigation, push or pop — see `navigateTo`/`goBack`), a dirty
 * guard shared by navigation and close (see `guardDirty`), and `disableClose` toggled on the
 * `MatDialogRef` while the edit form is dirty. Installment/Subscription edit forms are not
 * built yet — `mode` can only ever go to `'EDIT'` when the current item is an Expense.
 */
@Component({
  selector: 'app-omega-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatIconModule,
    BrDatePipe,
    ViewerFieldListComponent,
    ViewerEditFormComponent,
  ],
  providers: [OmegaViewerService],
  templateUrl: './omega-viewer.component.html',
  styleUrl: './omega-viewer.component.scss',
})
export class OmegaViewerComponent {
  private readonly dialogRef =
    inject<MatDialogRef<OmegaViewerComponent, OmegaViewerResult>>(MatDialogRef);
  private readonly viewerService = inject(OmegaViewerService);
  private readonly initialRef = inject<OmegaViewerRef>(MAT_DIALOG_DATA);
  private readonly tagService = inject(TagService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly expenseService = inject(ExpenseService);
  private readonly matDialog = inject(MatDialog);

  /** Title heading of the currently-displayed item — F-11 keyboard focus lands here on
   * every page-flip so focus is never lost mid-navigation. `tabindex="-1"` on the host
   * element (set in the template) makes a non-interactive heading a valid focus target. */
  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('titleEl');

  /** Navigation stack — index 0 is the item the viewer was opened with. */
  private readonly history = signal<readonly OmegaViewerRef[]>([this.initialRef]);
  /** Set whenever a mutation happens anywhere in the stack (edit save, note save, payment
   * revert, in later tasks) — surfaces as `OmegaViewerResult.mutated` on close regardless
   * of which item was on screen when the mutation occurred. */
  private readonly mutated = signal(false);

  /** F-07 edit mode, scoped to whatever `current()` is. Reset to `'VIEW'` inside every
   * `navigateTo`/`goBack` mutation of `history` — never carried across items. */
  protected readonly mode = signal<OmegaViewerMode>('VIEW');
  /** Mirrors `ViewerEditFormComponent`'s `dirtyChange` output — drives both the
   * navigate/close guard and `MatDialogRef.disableClose`. */
  private readonly formDirty = signal(false);
  protected readonly saving = signal(false);
  /**
   * Result of the most recent successful save for the item currently on screen — layered on
   * top of `detailState`'s HTTP-derived value in `readyDetail` below so the viewer reflects
   * the patch response immediately without refetching. Keyed by ref so a stale override can
   * never leak onto a different item after navigation; cleared on every `navigateTo`/`goBack`.
   */
  private readonly savedOverride = signal<{ ref: OmegaViewerRef; detail: OmegaViewerDetail } | null>(
    null,
  );

  /** Text of the most recent `aria-live` announcement — screen readers hear this whenever a
   * page-flip lands on a new item (F-11). Empty on first paint (nothing to announce yet, and
   * an initial announcement on open would just be noise on top of the dialog's own title). */
  protected readonly liveAnnouncement = signal('');

  /** Toggles the slide+fade page-flip animation class. Always `false` when the user's OS
   * prefers reduced motion — the transition becomes an instant swap instead (F-11 acceptance
   * criterion: reduced-motion must be honored, not merely CSS-transitioned and hoped for). */
  protected readonly animateFlip = signal(false);

  private readonly prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  protected readonly current = computed<OmegaViewerRef>(() => {
    const stack = this.history();
    return stack[stack.length - 1];
  });
  protected readonly canGoBack = computed(() => this.history().length > 1);

  /**
   * `switchMap` over `toObservable(current)` — cancels any in-flight `load()` request the
   * instant `current()` changes (rapid navigateTo/goBack clicks), so a slow, now-abandoned
   * response can never overwrite a newer navigation's result.
   */
  protected readonly detailState = toSignal(
    toObservable(this.current).pipe(
      switchMap((ref) =>
        this.viewerService.load(ref).pipe(
          map((detail): DetailState => ({ status: 'ready', detail })),
          catchError(() => of<DetailState>({ status: 'error' })),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as DetailState },
  );

  /** Non-null only while `detailState().status === 'ready'` — split out so the template
   * can bind to a properly-typed `OmegaViewerDetail` without an `$any()` cast. F-07: layers
   * `savedOverride` on top when it matches the current ref, so a successful patch updates
   * what's on screen without a refetch — the frontend never computes/guesses `remaining`
   * itself here, it only ever displays whatever the backend's patch response contained. */
  protected readonly readyDetail = computed<OmegaViewerDetail | null>(() => {
    const state = this.detailState();
    const base = state.status === 'ready' ? state.detail : null;
    if (!base) {
      return null;
    }

    const override = this.savedOverride();
    if (override && override.ref.kind === base.ref.kind && override.ref.id === base.ref.id) {
      return override.detail;
    }
    return base;
  });

  /** F-12: label/value rows for the field list, precomputed here so
   * `ViewerFieldListComponent` stays a dumb display component with no mapping logic of its
   * own. Recomputes only when the ready detail or the name lookup maps change. */
  protected readonly fieldRows = computed<readonly OmegaViewerFieldRow[]>(() => {
    const detail = this.readyDetail();
    if (!detail) {
      return [];
    }
    return mapDetailToFieldRows(detail, {
      tagNameById: this.tagNameById(),
      creditCardNameById: this.creditCardNameById(),
    });
  });

  /** F-12: installments-remaining badge state — `0` (fully paid) and `null` (not
   * installment-linked) are kept as distinct union members all the way to the template. */
  protected readonly remainingBadge = computed<OmegaViewerRemainingBadge>(() => {
    const detail = this.readyDetail();
    return detail ? mapRemainingBadge(detail) : { kind: 'none' };
  });

  /** `TagService`/`CreditCardService` are both `providedIn: 'root'` app-lifetime singletons
   * populated by whichever page loaded before the viewer opened — reading their streams here
   * is a read-only lookup map, not a fetch trigger, matching the plan's "import services
   * freely" rule (services only, never feature components/pages). */
  private readonly tags = toSignal(this.tagService.tags$, { initialValue: [] });
  /** `protected` (not `private`) — F-07's edit form needs the raw list for its credit-card
   * `<select>` options, not just the name-lookup map derived below. */
  protected readonly creditCards = toSignal(this.creditCardService.cards$, { initialValue: [] });

  private readonly tagNameById = computed(
    () => new Map(this.tags().map((tag) => [tag.id, tag.name])),
  );
  private readonly creditCardNameById = computed(
    () => new Map(this.creditCards().map((card) => [card.id, card.name])),
  );

  private lastAnnouncedRef: OmegaViewerRef | null = null;

  constructor() {
    // Credit cards are an app-lifetime `providedIn: 'root'` cache (see the doc comment on
    // `creditCards` above) populated by whichever page loaded before the viewer opened — the
    // Expense edit form (F-07) needs the full list for its `<select>`, and the Expense page
    // itself never triggers `loadAll()` (only Credit Card/Subscription pages do today), so
    // this call is a defensive, idempotent refresh: `CreditCardService.loadAll()` just
    // re-emits onto the same `BehaviorSubject`, safe to call even if another page already
    // populated it.
    this.creditCardService.loadAll();

    // Keeps `MatDialogRef.disableClose` in lockstep with the edit form's dirty state (F-07
    // acceptance: clicking outside or pressing ESC must not silently discard unsaved edits).
    effect(() => {
      this.dialogRef.disableClose = this.mode() === 'EDIT' && this.formDirty();
    });
    // Fires on every `readyDetail()` change (new item finished loading), including the very
    // first one — focuses the title heading and announces the change via aria-live, so
    // keyboard/screen-reader users never lose their place across a page-flip.
    //
    // Only `readyDetail()` is a tracked dependency here. `titleRef()` is read via `untracked`
    // deliberately: the `#titleEl` element doesn't exist yet on the very first pass where
    // `readyDetail()` turns non-null (the `@switch` body renders on the following change
    // detection cycle), so `titleRef()` starts as `undefined` and only becomes truthy one
    // tick later. If it were tracked, that later change would itself re-trigger this effect
    // — with `lastAnnouncedRef` already set from the first run — and misreport a second,
    // spurious "navigation" announcement for what is still the initial load.
    effect(() => {
      const detail = this.readyDetail();
      if (!detail) {
        return;
      }
      const isNavigation = this.lastAnnouncedRef !== null;
      this.lastAnnouncedRef = detail.ref;

      if (isNavigation) {
        this.liveAnnouncement.set(`Agora exibindo: ${titleOf(detail)}`);
      }
      if (!this.prefersReducedMotion) {
        this.animateFlip.set(false);
        // Re-trigger the CSS animation class on the next microtask — toggling off then on
        // in the same tick would be coalesced away by change detection.
        queueMicrotask(() => this.animateFlip.set(true));
      }

      // Runs after the current + microtask work above; the title element may not exist yet
      // on this exact turn (view not rendered), so retry on the next microtask too — cheap,
      // and guarantees focus lands once the heading is actually in the DOM.
      queueMicrotask(() => untracked(() => this.titleRef()?.nativeElement.focus()));
    });
  }

  protected navigateTo(ref: OmegaViewerRef): void {
    this.guardDirty(() => {
      this.history.update((stack) => [...stack, ref]);
      this.savedOverride.set(null);
      this.leaveEditMode();
    });
  }

  protected goBack(): void {
    this.guardDirty(() => {
      this.history.update((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
      this.savedOverride.set(null);
      this.leaveEditMode();
    });
  }

  protected retry(): void {
    // Re-push the same ref so `current` emits a new reference and the switchMap re-fires,
    // even though the value is structurally identical to what's already at the top.
    this.history.update((stack) => [...stack.slice(0, -1), { ...stack[stack.length - 1] }]);
    this.savedOverride.set(null);
  }

  protected close(): void {
    this.guardDirty(() => this.dialogRef.close({ mutated: this.mutated() }));
  }

  /** Entry point for the "Editar" action in the template — only reachable while the current
   * item is an Expense (Installment/Subscription edit forms aren't built yet). */
  protected enterEditMode(): void {
    if (this.readyDetail()?.kind !== 'EXPENSE') {
      return;
    }
    this.mode.set('EDIT');
  }

  /** Wired to `ViewerEditFormComponent`'s `cancelEdit` output — same dirty guard as
   * navigation, since abandoning the form without saving is exactly the scenario the guard
   * exists for. */
  protected cancelEdit(): void {
    this.guardDirty(() => this.leaveEditMode());
  }

  protected onFormDirtyChange(dirty: boolean): void {
    this.formDirty.set(dirty);
  }

  /** Wired to `ViewerEditFormComponent`'s `save` output. `patch` only carries the fields the
   * form actually changed (built by the form itself) — the backend's `PatchExpenseUseCase`
   * treats every absent field as "don't touch", so this never re-sends untouched values.
   * On success: exits edit mode, layers the patch response onto `readyDetail` via
   * `savedOverride` (no refetch), and flags `mutated` so `ExpensePage` reloads its list on
   * close. `remaining` is never computed here — whatever the backend returns is what renders. */
  protected saveEdit(patch: PatchExpenseRequest): void {
    const detail = this.readyDetail();
    if (!detail || detail.kind !== 'EXPENSE') {
      return;
    }

    this.saving.set(true);
    this.expenseService.patch(detail.ref.id, patch).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.mutated.set(true);
        this.formDirty.set(false);
        this.savedOverride.set({
          ref: detail.ref,
          detail: {
            ...detail,
            name: updated.name,
            cost: updated.cost,
            remaining: updated.remaining,
            purchaseDate: updated.purchaseDate,
            creditCardId: updated.creditCardId ?? null,
            details: updated.details ?? null,
          },
        });
        this.leaveEditMode();
      },
      error: () => this.saving.set(false),
    });
  }

  private leaveEditMode(): void {
    this.mode.set('VIEW');
    this.formDirty.set(false);
  }

  /** Shared by `navigateTo`/`goBack`/`close`/`cancelEdit` — if the edit form is dirty, opens
   * `ViewerDiscardConfirmDialogComponent` and only runs `action` when the user confirms
   * discarding; otherwise runs `action` immediately. */
  private guardDirty(action: () => void): void {
    if (this.mode() !== 'EDIT' || !this.formDirty()) {
      action();
      return;
    }

    this.matDialog
      .open<ViewerDiscardConfirmDialogComponent, void, boolean>(ViewerDiscardConfirmDialogComponent)
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          action();
        }
      });
  }
}
