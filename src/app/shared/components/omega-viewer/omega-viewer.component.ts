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
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, map, of, switchMap } from 'rxjs';

import { CreditCardService } from '@features/credit-card/services/credit-card.service';
import { TagService } from '@features/tag/services/tag.service';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';

import { OmegaViewerDetail } from './models/omega-viewer-detail';
import { OmegaViewerFieldRow, OmegaViewerRemainingBadge } from './models/omega-viewer-field-row';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { mapDetailToFieldRows, mapRemainingBadge } from './omega-viewer-field-mapper';
import { OmegaViewerService } from './omega-viewer.service';
import { ViewerFieldListComponent } from './sections/viewer-field-list.component';

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
 * No edit mode (F-07) or payments section (F-09) yet — those plug into this shell later.
 *
 * `OmegaViewerService` is provided here at component scope (`providers: [OmegaViewerService]`)
 * — it is modal view-state, not an app-lifetime singleton, so it must NOT be
 * `providedIn: 'root'` (would leak state/subscriptions across separate viewer sessions).
 *
 * Back always refetches — no caching across the stack (confirmed decision, see the Omega
 * Viewer README's decisions table). This keeps `history` a plain array of refs, never of
 * resolved details.
 */
@Component({
  selector: 'app-omega-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule, BrDatePipe, ViewerFieldListComponent],
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
   * can bind to a properly-typed `OmegaViewerDetail` without an `$any()` cast. */
  protected readonly readyDetail = computed<OmegaViewerDetail | null>(() => {
    const state = this.detailState();
    return state.status === 'ready' ? state.detail : null;
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
  private readonly creditCards = toSignal(this.creditCardService.cards$, { initialValue: [] });

  private readonly tagNameById = computed(
    () => new Map(this.tags().map((tag) => [tag.id, tag.name])),
  );
  private readonly creditCardNameById = computed(
    () => new Map(this.creditCards().map((card) => [card.id, card.name])),
  );

  private lastAnnouncedRef: OmegaViewerRef | null = null;

  constructor() {
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
    this.history.update((stack) => [...stack, ref]);
  }

  protected goBack(): void {
    this.history.update((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  }

  protected retry(): void {
    // Re-push the same ref so `current` emits a new reference and the switchMap re-fires,
    // even though the value is structurally identical to what's already at the top.
    this.history.update((stack) => [...stack.slice(0, -1), { ...stack[stack.length - 1] }]);
  }

  protected close(): void {
    this.dialogRef.close({ mutated: this.mutated() });
  }
}
