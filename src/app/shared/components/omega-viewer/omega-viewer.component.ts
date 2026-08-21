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
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, filter, map, of, switchMap } from 'rxjs';

import { CreditCardService } from '@features/credit-card/services/credit-card.service';
import { PatchExpenseRequest } from '@features/expense/models/expense';
import { ExpenseService } from '@features/expense/services/expense.service';
import { PaymentService } from '@features/payment/services/payment.service';
import {
  isMigrationNotReversibleProblem,
  MigrationNotReversibleProblem,
} from '@features/reserved-budget/models/reserved-budget';
import { ReservedBudgetService } from '@features/reserved-budget/services/reserved-budget.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { TagService } from '@features/tag/services/tag.service';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';

import {
  OmegaViewerDetail,
  OmegaViewerPayment,
  OmegaViewerReservedBudgetMigrationDetail,
} from './models/omega-viewer-detail';
import { OmegaViewerFieldRow, OmegaViewerRemainingBadge } from './models/omega-viewer-field-row';
import { formatPaymentDateLabel } from './models/omega-viewer-payment-row';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { formatBrl } from '@shared/utils/currency';
import { mapDetailToFieldRows, mapRemainingBadge } from './omega-viewer-field-mapper';
import { OmegaViewerService } from './omega-viewer.service';
import { ViewerDiscardConfirmDialogComponent } from './sections/viewer-discard-confirm-dialog.component';
import { ViewerEditFormComponent } from './sections/viewer-edit-form.component';
import { ViewerFieldListComponent } from './sections/viewer-field-list.component';
import { ViewerNotesSectionComponent } from './sections/viewer-notes-section.component';
import { ViewerPaymentsSectionComponent } from './sections/viewer-payments-section.component';
import {
  ViewerRevertConfirmDialogComponent,
  ViewerRevertConfirmDialogData,
} from './sections/viewer-revert-confirm-dialog.component';

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
    case 'RESERVED_BUDGET_MIGRATION':
      return detail.description ?? `Migração · ${detail.bulletDescription}`;
  }
}

/** RBM-F16: same `"{Mon} {YYYY}"` grammar `ReservedBudgetPage.formatMonth()` (RBM-F7) already
 * uses for the identical confirm-dialog `dateLabel` field — the two revert entry points must
 * read as the same UI, not two independently-invented date formats (RBM-F16 rule 3). */
function formatMonthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/**
 * Omega Viewer shell — a modal that shows one item at a time with page-flip navigation between
 * linked items. Four kinds as of RBM-F14: Expense/Installment/Subscription, plus
 * `RESERVED_BUDGET_MIGRATION` (a reserved-budget-to-bullet migration). F-05 delivered the
 * navigable shell (history stack, detail resolution, loading/error/retry). F-11 adds the
 * link-navigation UI (slide+fade page-flip, `prefers-reduced-motion` support, keyboard focus
 * management, `aria-live` announcements). F-12 adds the field-list body via
 * `ViewerFieldListComponent`. F-07 adds Expense edit mode (see below). F-08 adds the notes
 * section (see below) via `ViewerNotesSectionComponent`, rendered for Expense/Installment/
 * Subscription — NOT the migration kind, which has no `details` field at all (RBM-F14). F-09/
 * F-10 add the payments section for Expense/Installment. RBM-F16 adds migration revert: a
 * dedicated "Reverter migration" button/section, gated by `canRevertMigration()`, that calls
 * `ReservedBudgetService.deleteMigration()` — the SAME write path `ReservedBudgetPage`'s own
 * card-based undo (RBM-F7) uses, never a second one. This is the 2nd of the 2 coordinated
 * reversal entry points the RBM epic's README calls for; see `requestRevertMigration()`'s doc
 * comment for the 3 coordination rules.
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
 * `MatDialogRef` while the edit form is dirty. Installment/Subscription full-record edit forms
 * are not built yet — `mode` can only ever go to `'EDIT'` when the current item is an Expense.
 *
 * F-08 adds the notes section: `ViewerNotesSectionComponent` owns its OWN local edit state
 * (deliberately not the shell's `mode` signal — see that component's doc comment for why),
 * editable for Expense/Subscription and read-only for Installment. Its dirtiness (`notesDirty`,
 * fine-grained) is folded into `guardDirty()` and its coarse "is editing at all" counterpart
 * (`notesEditing`) into `disableClose` — the same `mode`/`formDirty` split the full Expense
 * edit form already uses, and for the same reason (code review M1): a coarse, race-free signal
 * for the native ESC/backdrop block, a fine one for "is there actually something to lose".
 * `enterEditMode()` itself is routed through `guardDirty()` (code review C1) since it destroys
 * the notes section, and the shell defensively self-heals both signals if that section is ever
 * torn down through any OTHER path too (see the `notesSection` viewChild effect).
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
    ViewerNotesSectionComponent,
    ViewerPaymentsSectionComponent,
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
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly paymentService = inject(PaymentService);
  private readonly matDialog = inject(MatDialog);
  /** RBM-F16: the ONE write path for undoing a migration, shared with `ReservedBudgetPage`'s
   * card-based undo (RBM-F7). No second service/method is introduced here — see
   * `deleteMigration()`'s own docstring and the class doc's coordination note below. Injecting
   * a feature service into this shared shell is the same pattern already used for
   * `ExpenseService`/`SubscriptionService`/`PaymentService` above, not a new exception. */
  private readonly reservedBudgetService = inject(ReservedBudgetService);

  /** Title heading of the currently-displayed item — F-11 keyboard focus lands here on
   * every page-flip so focus is never lost mid-navigation. `tabindex="-1"` on the host
   * element (set in the template) makes a non-interactive heading a valid focus target. */
  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('titleEl');
  /** Code review M2: imperative handle onto the notes section so `guardDirty()`'s confirmed
   * branch can command it to drop local edit state (`resetEdit()`) instead of only hoping it
   * notices via `detail()` changing — see `ViewerNotesSectionComponent.resetEdit()`'s doc
   * comment. `undefined` whenever the section isn't rendered (full Expense edit mode, or the
   * detail hasn't loaded yet) — every call site below already guards on that. */
  private readonly notesSection = viewChild(ViewerNotesSectionComponent);

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
  /** F-08: mirrors `ViewerNotesSectionComponent`'s `dirtyChange` output — a second,
   * independent dirty source (notes editing is a component-local mode, not the shell's
   * `mode` signal, see that component's doc comment) folded into the SAME `guardDirty()` via
   * `isDirty()` below, so an unsaved note is guarded exactly like an unsaved full Expense
   * edit — one dirty-guard behavior for the user, not two divergent ones. */
  private readonly notesDirty = signal(false);
  /** Code review M1: mirrors `ViewerNotesSectionComponent`'s `editingChange` output — the
   * coarse "notes form is open" counterpart to `mode` for `disableClose`, exactly as
   * `formDirty` is the fine counterpart to `notesDirty` for `guardDirty()`. See the
   * `disableClose` effect below for why `notesDirty` alone isn't enough there. */
  private readonly notesEditing = signal(false);
  /** Save-in-flight / failure state for the notes section — kept separate from
   * `saving`/`saveError` (the full Expense edit form's own state) rather than shared, even
   * though the two can never be visually active at the same time (notes only renders in
   * `mode() === 'VIEW'`): sharing would make `saveEdit`/`saveNotes` reset each other's error
   * message on unrelated failures, which is confusing when Expense's full-edit save error and
   * a notes-only save error are conceptually different failures. */
  protected readonly notesSaving = signal(false);
  protected readonly notesSaveError = signal<string | null>(null);
  /** F-10: id of the payment currently being reverted, `null` when none is in flight — kept
   * shell-local (set imperatively in `revertPayment()`'s subscribe handlers) rather than bound
   * to `PaymentService.reverting$`/`error$` directly: those are `providedIn: 'root'` subjects
   * shared with `PaymentPage`, and this shell already has a firm rule (see `notesSaving`'s doc
   * comment above) of never trusting a shared app-lifetime stream for view-local save/error UI
   * state, to avoid one open surface's state bleeding into another's. */
  protected readonly revertingId = signal<string | null>(null);
  protected readonly revertError = signal<string | null>(null);
  /** RBM-F16: mirrors `revertingId`/`revertError` above, shell-local for the exact same reason
   * documented on those two — `ReservedBudgetService`'s `migrating$`/`error$` are `providedIn:
   * 'root'` streams shared with `ReservedBudgetPage`, and this shell never trusts a shared
   * app-lifetime stream for view-local save/error UI state. `true` while the revert request for
   * the migration on screen is in flight. */
  protected readonly revertingMigration = signal(false);
  protected readonly revertMigrationError = signal<string | null>(null);
  /** RBM-F16: set right before `retry()` refetches after a successful migration revert — the
   * migration ITSELF ceased to exist, so the refetch is expected to 404 (unlike every other
   * `retry()` call site, where a fetch error is really an error). The `detailState` effect below
   * reads this once, right after the refetch settles, and closes the dialog when both are true
   * instead of falling into the generic error UI — see `revertMigration()`'s own doc comment. */
  private readonly expectMigrationGoneAfterRetry = signal(false);
  /** User-facing message for the most recent failed save attempt, `null` when there is none
   * to show. Rendered inside `ViewerEditFormComponent` (still-open modal) rather than
   * relying on `ExpenseService.error$` — that stream surfaces in `ExpensePage`, which sits
   * *behind* the open Viewer dialog and is therefore invisible while the user needs it most
   * (code review C2). Cleared at the start of every save attempt and on leaving EDIT. */
  protected readonly saveError = signal<string | null>(null);
  /**
   * Result of the most recent successful save for the item currently on screen — layered on
   * top of `detailState`'s HTTP-derived value in `readyDetail` below so the viewer reflects
   * the patch response immediately without refetching. Keyed by ref so a stale override can
   * never leak onto a different item after navigation; cleared on every `navigateTo`/`goBack`.
   */
  private readonly savedOverride = signal<{
    ref: OmegaViewerRef;
    detail: OmegaViewerDetail;
  } | null>(null);

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

  /** F-09: only Expense/Installment details carry a `payments` trace — Subscription has none
   * (confirmed intentional, see `ViewerPaymentsSectionComponent`'s doc comment). Precomputed
   * here so the template's `@if` stays a plain signal read, no inline kind comparison.
   *
   * Code review M1: also requires `mode() === 'VIEW'` explicitly, rather than relying on the
   * template only ever placing this section inside the `VIEW`-mode `@else` branch (full
   * Expense edit swaps the whole body for `ViewerEditFormComponent`). That template placement
   * was already correct, but it made "no revert during full-edit" an accident of layout, not a
   * guarantee this `computed()` itself enforces — if the template were ever reorganized, the
   * revert button would become reachable during a dirty full-edit with no guard on that path,
   * with a much larger blast radius than the notes-section case (the whole Expense edit would
   * be lost, not just a note). Folding `mode()` in here makes the guarantee structural. */
  protected readonly showPaymentsSection = computed(() => {
    const detail = this.readyDetail();
    if (!detail || this.mode() !== 'VIEW') {
      return false;
    }
    return detail.kind === 'EXPENSE' || detail.kind === 'INSTALLMENT';
  });

  /** RBM-F16: `true` only for the migration kind AND `revertable === true` — same pattern this
   * class already uses for `showPaymentsSection` (a `computed()`, never an inline kind
   * comparison in the template). Post-epic code review MAJOR 2: `revertable` is now derived from
   * the real DTO's `reverted` flag (`!dto.reverted`, see `OmegaViewerService.mapReservedBudget-
   * Migration`), so this can genuinely be `false` on load — reopening an already-reverted
   * migration — in addition to the 409 `MigrationNotReversibleException` case (bullet already
   * spent the amount) surfaced only after a revert attempt. The template distinguishes the two
   * causes via `detail.reverted` — see `omega-viewer.component.html`'s ineligible branch. */
  protected readonly canRevertMigration = computed(() => {
    const detail = this.readyDetail();
    return detail?.kind === 'RESERVED_BUDGET_MIGRATION' && detail.revertable;
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

    // `disableClose` is fixed to `mode() === 'EDIT'` — NOT conditioned on `formDirty()`. Two
    // reasons:
    //   1. Race-window safety (code review C1a): `formDirty` only flips once
    //      `ViewerEditFormComponent` emits `dirtyChange`, which happens inside a
    //      `valueChanges` subscribe — there's a tick between the user's first keystroke and
    //      that emission landing here. Gating `disableClose` on `formDirty` left that tick
    //      open for ESC/backdrop to slip through unguarded. Gating on `mode()` alone closes
    //      the window entirely: the instant EDIT starts, native ESC/backdrop are blocked,
    //      full stop.
    //   2. `disableClose` blocking natively (no dialog, no feedback) is also wrong on its own
    //      (code review C1b) — see the `keydownEvents`/`backdropClick` subscriptions below,
    //      which route both through `close()` (the same `guardDirty()`-backed path the "×"
    //      button already used) instead of leaving the user stuck with a modal that appears
    //      to ignore the Escape key.
    //
    // F-08: also `true` while `notesEditing()` — notes editing is a component-local mode (see
    // `ViewerNotesSectionComponent`'s doc comment) that can be active while the shell's own
    // `mode()` is still `'VIEW'`, so `mode() === 'EDIT'` alone would miss it entirely and let
    // ESC/backdrop silently drop an in-progress note edit.
    //
    // Code review M1: this used to gate on `notesDirty()` (fine-grained) instead of
    // `notesEditing()` (coarse). That reopened the exact C1a race window the `mode`-not-
    // `formDirty` choice above was designed to close: between the user's first keystroke in
    // the notes textarea and `dirtyChange(true)` landing here (a tick later, from inside a
    // `valueChanges` subscribe), `notesDirty()` was still `false` and ESC/backdrop could slip
    // through unguarded. `notesEditing()` flips the instant the notes `FormGroup` is created
    // (`startEdit()`), with no dependency on the form actually being dirty yet — same
    // race-free guarantee `mode()` already gives the full Expense form. `notesDirty` stays
    // reserved for `guardDirty()` below, where the fine-grained "is there actually something
    // to lose" distinction is exactly what's wanted.
    effect(() => {
      this.dialogRef.disableClose = this.mode() === 'EDIT' || this.notesEditing();
    });

    // Code review C1 (defensive part, take 2): the natural fix — have
    // `ViewerNotesSectionComponent` emit `dirtyChange(false)`/`editingChange(false)` from its
    // own `DestroyRef.onDestroy()` when the shell tears it down (full Expense edit mode) —
    // does NOT work with signal-based `output()`. `OutputEmitterRef` marks itself destroyed via
    // its OWN `DestroyRef.onDestroy()` callback, registered when the output field is
    // constructed (before the component's constructor body runs), so by the time any
    // `onDestroy` callback added inside the constructor fires, the output is already dead —
    // `emit()` silently no-ops with an `NG0953` console warning instead of reaching here.
    // Confirmed with a failing test before landing this fix the other way.
    //
    // Instead: `notesSection` (a `viewChild`) is itself a reactive signal — it flips to
    // `undefined` the instant Angular removes `<app-viewer-notes-section>` from the DOM, no
    // extra wiring in the child needed. Watching that transition here gives the shell the same
    // guarantee (self-healing `notesDirty`/`notesEditing`, whatever destroys the section) with
    // no dependency on the child's own teardown machinery at all.
    let hadNotesSection = false;
    effect(() => {
      const hasNotesSection = this.notesSection() !== undefined;
      if (hadNotesSection && !hasNotesSection) {
        this.notesDirty.set(false);
        this.notesEditing.set(false);
        this.notesSaveError.set(null);
      }
      hadNotesSection = hasNotesSection;
    });

    // Routes ESC and backdrop-click through `close()` — the exact same `guardDirty()` path as
    // the "×" button — instead of letting Material's native `disableClose` merely swallow
    // them. With `disableClose` now fixed to `mode() === 'EDIT' || notesEditing()` (see effect
    // above), these subscriptions are the only way ESC/backdrop can ever fire whenever
    // `disableClose` is `true`; whenever it's `false`, Material's own handling never reaches
    // here anyway — no double-close risk either way.
    this.dialogRef
      .keydownEvents()
      .pipe(
        filter((event) => event.key === 'Escape'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());

    this.dialogRef
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.close());
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

    // RBM-F16: closes the viewer instead of showing the generic error+Retry state when a
    // refetch 404s specifically because the migration on screen was just reverted away by
    // this same shell — see `revertMigration()`'s doc comment for why a generic "couldn't
    // load, try again" is actively wrong here (the item wasn't lost by accident, it was
    // deliberately deleted by the user's own confirmed action one line above).
    // `expectMigrationGoneAfterRetry` is read/cleared inside the effect, not the HTTP pipe
    // itself, so an UNRELATED error status still falls through to the normal error UI.
    effect(() => {
      const state = this.detailState();
      if (state.status !== 'error' || !this.expectMigrationGoneAfterRetry()) {
        return;
      }
      this.expectMigrationGoneAfterRetry.set(false);
      this.dialogRef.close({ mutated: this.mutated() });
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
   * item is an Expense (Installment/Subscription edit forms aren't built yet).
   *
   * Code review C1: entering full-edit destroys `<app-viewer-notes-section>` (the template's
   * `@else` branch that renders it is swapped for `ViewerEditFormComponent` — see the
   * shell's HTML), which is exactly the kind of unsaved-work loss `guardDirty()` exists to
   * catch. Routed through the guard like every other exit path (`navigateTo`/`goBack`/
   * `close`/`cancelEdit`) instead of setting `mode` directly, so an in-progress note edit is
   * never silently discarded and `notesDirty` never gets left stuck `true` (the guard's
   * confirmed branch already resets it). */
  protected enterEditMode(): void {
    if (this.readyDetail()?.kind !== 'EXPENSE') {
      return;
    }
    this.guardDirty(() => this.mode.set('EDIT'));
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

  /** Wired to `ViewerNotesSectionComponent`'s `dirtyChange` output (F-08) — see `notesDirty`'s
   * doc comment for why this is a second signal rather than reusing `formDirty`. */
  protected onNotesDirtyChange(dirty: boolean): void {
    this.notesDirty.set(dirty);
  }

  /** Wired to `ViewerNotesSectionComponent`'s `editingChange` output (code review M1) — see
   * `notesEditing`'s doc comment for why `disableClose` needs this coarse signal alongside
   * the fine-grained `notesDirty`. */
  protected onNotesEditingChange(editing: boolean): void {
    this.notesEditing.set(editing);
  }

  /** Wired to `ViewerNotesSectionComponent`'s `cancelEdit` output — no dirty guard needed here
   * (unlike `cancelEdit()` for the full Expense form): the notes section itself already
   * resets its own local form state before emitting, so by the time this fires `notesDirty`
   * is already back to `false`. This handler exists only so a future need (e.g. an
   * shell-level toast) has somewhere to hook in — today it's a no-op. */
  protected onNotesCancelEdit(): void {
    this.notesSaveError.set(null);
  }

  /** Wired to `ViewerNotesSectionComponent`'s `save` output (F-08). Routes to
   * `ExpenseService.patch()`/`SubscriptionService.update()` depending on the current item's
   * kind — Installment never reaches here (`ViewerNotesSectionComponent` renders no Save
   * button for it). Same "layer the response onto `readyDetail` via `savedOverride`, no
   * refetch" pattern `saveEdit()` already uses for the full Expense form, and the same
   * `mutated`/error-surfacing conventions. */
  protected saveNotes(details: string): void {
    const detail = this.readyDetail();
    if (!detail) {
      return;
    }

    this.notesSaving.set(true);
    this.notesSaveError.set(null);

    if (detail.kind === 'EXPENSE') {
      this.expenseService.patch(detail.ref.id, { details }).subscribe({
        next: (updated) => {
          this.notesSaving.set(false);
          this.notesDirty.set(false);
          this.mutated.set(true);
          this.savedOverride.set({
            ref: detail.ref,
            detail: { ...detail, details: updated.details ?? null, audit: null },
          });
        },
        error: (error: unknown) => {
          this.notesSaving.set(false);
          this.notesSaveError.set(this.describeSaveError(error));
        },
      });
      return;
    }

    if (detail.kind === 'SUBSCRIPTION') {
      this.subscriptionService.update(detail.ref.id, { details }).subscribe({
        next: (updated) => {
          this.notesSaving.set(false);
          this.notesDirty.set(false);
          this.mutated.set(true);
          this.savedOverride.set({
            ref: detail.ref,
            detail: { ...detail, details: updated.details ?? null, audit: null },
          });
        },
        error: (error: unknown) => {
          this.notesSaving.set(false);
          this.notesSaveError.set(this.describeSaveError(error));
        },
      });
    }
  }

  /** Wired to `ViewerEditFormComponent`'s `save` output. `patch` only carries the fields the
   * form actually changed (built by the form itself) — the backend's `PatchExpenseUseCase`
   * treats every absent field as "don't touch", so this never re-sends untouched values.
   * On success: exits edit mode, layers the patch response onto `readyDetail` via
   * `savedOverride` (no refetch), and flags `mutated` so `ExpensePage` reloads its list on
   * close. `remaining` is never computed here — whatever the backend returns is what renders.
   * On failure (code review C2): surfaces a visible `saveError` inside the still-open modal
   * instead of silently dropping the error — the previous handler discarded it entirely,
   * which is especially dangerous here because `ExpenseCostBelowPaidAmountException`
   * (reducing `cost` below the amount already paid) is a routine, expected business
   * rejection in this domain, not an edge case. */
  protected saveEdit(patch: PatchExpenseRequest): void {
    const detail = this.readyDetail();
    if (!detail || detail.kind !== 'EXPENSE') {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
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
            // `ExpenseResponseDto` does not serialize `createdAt`/`updatedAt` (confirmed
            // against the backend DTO), so there is no real post-patch timestamp available
            // here to display. The backend re-stamps `updatedAt` on every save regardless —
            // showing the stale pre-patch value would silently lie about it (code review
            // M2). Hiding the audit footer until the next navigation/refetch is honest;
            // showing an outdated timestamp is not.
            audit: null,
          },
        });
        this.leaveEditMode();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.describeSaveError(error));
      },
    });
  }

  /** Wired to `ViewerPaymentsSectionComponent`'s `requestRevert` output (F-10). Opens
   * `ViewerRevertConfirmDialogComponent` — same "dumb section emits, shell owns the
   * confirmation + HTTP call" split F-08's notes section already established — and only calls
   * `PaymentService.revert()` if the user confirms. Passes `dateLabel` (not the raw
   * `paymentDate`) into the dialog via `formatPaymentDateLabel`, the exact same formatter
   * `ViewerPaymentsSectionComponent`'s own rows use, so the dialog's message never drifts from
   * what's on screen.
   *
   * Code review C1: routed through `guardDirty()` BEFORE the confirm dialog even opens, not
   * after the revert succeeds. `revertPayment()`'s success handler used to call `retry()`
   * directly — `retry()` pushes a new ref, the `switchMap` refetches, `detailState` emits a
   * NEW object identity (real `HttpClient` responses are always a fresh object; only the F-10
   * tests' `mockReturnValue(of(detail))` masked this by returning the SAME reference every
   * time), and `ViewerNotesSectionComponent`'s re-seed effect treats that identity change as
   * "different item, close local edit state" — silently destroying an in-progress note edit
   * with no guard, no confirmation, nothing. Same bug shape as `enterEditMode()`'s original
   * C1 (F-07/F-08).
   *
   * The guard runs here, before `PaymentService.revert()` is ever called, rather than around
   * the post-success `retry()` — the reviewer's preferred fix (ii). A revert is a real backend
   * write the instant the success callback runs; a "Descartar alterações?" prompt appearing
   * AFTER that write already persisted would leave the screen in an ambiguous state if the
   * user cancelled (stale trace vs. an edit the user chose to keep). Blocking before the
   * request goes out at all means the write and the discard decision can never race. */
  protected requestRevertPayment(payment: OmegaViewerPayment): void {
    this.guardDirty(() => this.openRevertConfirmDialog(payment));
  }

  private openRevertConfirmDialog(payment: OmegaViewerPayment): void {
    this.matDialog
      .open<ViewerRevertConfirmDialogComponent, { dateLabel: string }, boolean>(
        ViewerRevertConfirmDialogComponent,
        { data: { dateLabel: formatPaymentDateLabel(payment.paymentDate) } },
      )
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.revertPayment(payment.id);
        }
      });
  }

  /** Calls `PaymentService.revert()` (backend B5/B6, already merged). On success: re-fetches
   * the current item's own detail via `retry()` (same "push a new ref, let the switchMap
   * re-fire" mechanism the error-state Retry button already uses) instead of layering a
   * `savedOverride` — the reversal changes the WHOLE payment trace (the original flips to
   * `reversed`, a new reversal row appears), not a single field `saveEdit`/`saveNotes` could
   * patch onto the existing detail, so a full refetch is the only way to get an accurate
   * trace without hand-rebuilding it here. Flags `mutated` so `ExpensePage`/`InstallmentPage`
   * reload their list on close, same convention as every other mutation in this shell.
   * On failure: surfaces `revertError` inside the still-open modal (never silently dropped —
   * this exact silent-failure shape was code review C2, a critical finding, earlier in this
   * feature; not repeating it here for reversal errors).
   *
   * `retry()` itself is called directly here, NOT through `guardDirty()` again — by the time
   * this runs, `requestRevertPayment()` has already routed the whole flow through the guard
   * once, before the confirm dialog even opened (code review C1), so there is nothing left to
   * be dirty here: either nothing was dirty to begin with, or the user already confirmed
   * discarding it before this request was ever sent. */
  private revertPayment(paymentId: string): void {
    this.revertingId.set(paymentId);
    this.revertError.set(null);
    this.paymentService.revert(paymentId).subscribe({
      next: () => {
        this.revertingId.set(null);
        this.mutated.set(true);
        this.retry();
      },
      error: (error: unknown) => {
        this.revertingId.set(null);
        this.revertError.set(this.paymentService.describeRevertError(error));
      },
    });
  }

  /**
   * Wired to the migration section's "Reverter" button (RBM-F16). Same shape as
   * `requestRevertPayment()`: routed through `guardDirty()` first (a migration only ever
   * displays while `mode() === 'VIEW'`, so nothing should be dirty in practice, but the guard is
   * free insurance against a future template reorg reopening the same race C1 already closed
   * for payments), then confirmed via `ViewerRevertConfirmDialogComponent` with the SAME
   * `bodyOverride` shape RBM-F7 built for the Reserved Budget card's own undo button.
   *
   * This is one of the RBM epic's 2 coordinated migration-revert entry points (the other is
   * `ReservedBudgetPage.undoMigration()`, RBM-F7). Coordination, per the README:
   *   1. ONE write path — `revertMigration()` below calls `ReservedBudgetService.deleteMigration()`
   *      exclusively, never a second method invented here and never `ExtraBudgetService.delete()`
   *      directly. A concurrent revert from the other entry point resolves as a 404/409 on
   *      whichever call lands second — the backend is the real barrier against a double-revert,
   *      this shell does not try to prevent the race with shared client state.
   *   2. Each point reloads only its OWN screen — this shell sets `mutated`/closes so the bullet
   *      page (which opened it) reloads via its own `reloadWalletContext()`; it never reaches
   *      into `ReservedBudgetPage`'s state, and vice-versa. The two screens are never on-screen
   *      simultaneously (this is a modal over the bullet page; the RB card lives on another
   *      route), so there is nothing to synchronize live.
   *   3. IDENTICAL confirmation copy — same `bodyOverride` sentence shape as RBM-F7's card-based
   *      undo (amount, source bullet, destination reserve, month), so a user reverting from
   *      either point reads and confirms the exact same thing. Diverging the copy between the
   *      two points would be the cheapest way to reopen this risk.
   */
  protected requestRevertMigration(detail: OmegaViewerReservedBudgetMigrationDetail): void {
    this.guardDirty(() => this.openRevertMigrationConfirmDialog(detail));
  }

  private openRevertMigrationConfirmDialog(detail: OmegaViewerReservedBudgetMigrationDetail): void {
    const monthLabel = formatMonthLabel(detail.effectiveMonth);
    const data: ViewerRevertConfirmDialogData = {
      dateLabel: monthLabel,
      bodyOverride:
        `Undo this migration? ${formatBrl(detail.amount)} will leave the bullet ` +
        `"${detail.bulletDescription}" and return to the reserved budget ` +
        `"${detail.reservedBudgetDescription}" for ${monthLabel}.`,
    };

    this.matDialog
      .open<ViewerRevertConfirmDialogComponent, ViewerRevertConfirmDialogData, boolean>(
        ViewerRevertConfirmDialogComponent,
        { width: '30rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.revertMigration(detail);
        }
      });
  }

  /**
   * Calls `ReservedBudgetService.deleteMigration()` (RBM-F2/F7) — the ONE write path for
   * undoing a migration, never a second one invented here or a direct
   * `ExtraBudgetService.delete()` call (RBM-F16 rule 1; the coordination test in RBM-F17 pins
   * exactly this).
   *
   * On success: `mutated.set(true)` (so the bullet page reloads on close, same convention as
   * every other mutation in this shell) and `retry()` to refetch the current item. Unlike
   * `revertPayment()`, a successful migration revert makes the migration itself CEASE TO EXIST
   * — the refetch will 404. That is handled explicitly in `detailState`'s own `catchError`
   * (see `wasRevertedAway`), which closes the dialog instead of falling into the generic error
   * state — showing "Não foi possível carregar os detalhes" with a Retry button on an item that
   * was deliberately just deleted would be actively wrong, not just unpolished.
   *
   * On 409 `MigrationNotReversibleException` (the bullet already spent the amount): surfaces
   * `revertMigrationError` inside the still-open modal — never silently dropped, same
   * discipline `revertPayment()`'s own doc comment already established for this shell (code
   * review C2 elsewhere in this feature).
   */
  private revertMigration(detail: OmegaViewerReservedBudgetMigrationDetail): void {
    this.revertingMigration.set(true);
    this.revertMigrationError.set(null);
    this.reservedBudgetService
      .deleteMigration(detail.reservedBudgetId, detail.extraBudgetId)
      .subscribe({
        next: () => {
          this.revertingMigration.set(false);
          this.mutated.set(true);
          this.expectMigrationGoneAfterRetry.set(true);
          this.retry();
        },
        error: (error: unknown) => {
          this.revertingMigration.set(false);
          this.revertMigrationError.set(this.describeMigrationRevertError(error));
        },
      });
  }

  private describeMigrationRevertError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      const body: unknown = error.error;
      if (isMigrationNotReversibleProblem(body)) {
        return this.formatMigrationNotReversibleMessage(body);
      }
    }
    return 'Não foi possível desfazer a migration. Tente novamente.';
  }

  private formatMigrationNotReversibleMessage(problem: MigrationNotReversibleProblem): string {
    return (
      `Não foi possível desfazer — o bullet já gastou parte do valor migrado ` +
      `(disponível: ${formatBrl(problem.remaining)}, necessário: ${formatBrl(problem.required)}).`
    );
  }

  /** Best-effort mapping from a patch failure to a message the user can act on — shared by
   * `saveEdit()` (full Expense form) and `saveNotes()` (F-08, Expense/Subscription). The 422
   * `ExpenseCostBelowPaidAmountException` case is the one guaranteed to recur in practice
   * (reducing `cost` below what's already been paid) — `ViewerEditFormComponent`'s own
   * dynamic `min` validator (M1) should catch most of these client-side before the request
   * ever goes out, but the backend remains the source of truth, so this stays as the
   * fallback safety net for whatever slips past it or fails for any other reason. This
   * specific 422 title can only ever come from a `cost`-bearing patch (i.e. `saveEdit()`),
   * never from `saveNotes()` (`details`-only payload) — so the special-cased branch is
   * effectively dead for notes saves, which always fall through to the generic message
   * below; kept as one shared function rather than forked per-caller since the fallback text
   * is already kind-agnostic. */
  private describeSaveError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      const title = (error.error as { title?: string } | null)?.title;
      if (title === 'Expense cost below paid amount') {
        return 'O valor não pode ser menor que o quanto já foi pago nesta despesa.';
      }
    }
    return 'Não foi possível salvar as alterações. Tente novamente.';
  }

  private leaveEditMode(): void {
    this.mode.set('VIEW');
    this.formDirty.set(false);
    this.saveError.set(null);
  }

  /** Shared by `navigateTo`/`goBack`/`close`/`cancelEdit`/`enterEditMode` (code review C1) and
   * `requestRevertPayment()` (code review C1, F-10 follow-up) — if the full Expense edit form
   * OR the notes section (F-08) is dirty, opens `ViewerDiscardConfirmDialogComponent` and only
   * runs `action` when the user confirms discarding; otherwise runs `action` immediately.
   * `notesDirty` is checked independently of `mode()` — unlike the full edit form, notes
   * editing is a component-local mode that can be dirty while the shell itself is still in
   * `'VIEW'` (see `ViewerNotesSectionComponent`'s doc comment). */
  private guardDirty(action: () => void): void {
    const formIsDirty = this.mode() === 'EDIT' && this.formDirty();
    if (!formIsDirty && !this.notesDirty()) {
      action();
      return;
    }

    this.matDialog
      .open<ViewerDiscardConfirmDialogComponent, void, boolean>(ViewerDiscardConfirmDialogComponent)
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.notesDirty.set(false);
          this.notesSaveError.set(null);
          // Code review M2: the shell's own `notesDirty` mirror is cleared above, but the
          // notes section's local `FormGroup` isn't — `action()` below only changes `detail()`
          // for `navigateTo`/`goBack` (which re-triggers the section's own re-seed effect) or
          // tears the section down entirely (`enterEditMode`). Neither happens for
          // `cancelEdit()` (`action` is `leaveEditMode()`, which touches neither `detail()`
          // nor destroys the section), so without this call the section would reappear still
          // showing the very text the user just confirmed discarding — contradicting the
          // dialog they just answered. `resetEdit()` is a no-op if the section already closed
          // itself (or isn't rendered at all right now), so calling it unconditionally here is
          // safe for every `guardDirty()` caller, not just `cancelEdit()`.
          this.notesSection()?.resetEdit();
          action();
        }
      });
  }
}
