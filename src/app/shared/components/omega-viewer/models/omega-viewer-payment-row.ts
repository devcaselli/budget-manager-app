import { isDevMode } from '@angular/core';

import { formatBrl } from '@shared/utils/currency';
import { isRevertablePayment } from '@shared/utils/is-revertable-payment';

import { OmegaViewerPayment } from './omega-viewer-detail';

/**
 * Visual state pill for a payment row (F-09). `reversal` and `reversed` are two distinct,
 * non-exclusive-in-general states on `OmegaViewerPayment` (a row could theoretically be
 * neither, one, or — for a reversal-of-a-reversal edge case the backend does not currently
 * allow, see `isRevertablePayment` — both), so this is derived with `reversal` checked first:
 * a row that IS a reversal is always shown as `'reversal'` regardless of its own `reversed`
 * flag, since "this payment reversed another one" is the more relevant fact to a viewer.
 */
export type OmegaViewerPaymentStatus = 'normal' | 'reversal' | 'reversed';

/**
 * The reversal attached to a row, rendered as a subordinate detail of its ORIGINAL payment
 * rather than as a sibling row of equal weight. Only what the nested line actually renders is
 * kept: `id` (for the `aria-describedby` association), the formatted amount, and the full
 * `label` sentence. The reversal's own `dateLabel` is deliberately absent — it is already
 * baked into `label` — as is the full `OmegaViewerPayment`, since a nested line is never
 * revertable and nothing downstream reads it.
 */
export interface OmegaViewerPaymentReversalDetail {
  readonly id: string;
  readonly amountLabel: string;
  /** Full sentence for the nested line's accessible text, e.g. "Revertido em 09/09/2026".
   * Precomputed so the template never concatenates strings itself. */
  readonly label: string;
  /** Accessible name for the amount element itself, e.g. "Estorno de R$ 30,96 em 09/09/2026"
   * — so the nested amount is never encountered as a bare unexplained number. */
  readonly amountAriaLabel: string;
}

/**
 * Precomputed, template-ready row for `ViewerPaymentsSectionComponent` — all formatting/
 * lookups resolved once in a `computed()` upstream so the template only binds inputs, per the
 * same "no method calls in template" rule `ViewerFieldListComponent` (F-12) already follows.
 */
export interface OmegaViewerPaymentRow {
  readonly id: string;
  readonly dateLabel: string;
  readonly amountLabel: string;
  readonly bulletDescription: string;
  readonly status: OmegaViewerPaymentStatus;
  readonly payerLabel: string;
  /**
   * The reversal that undid THIS payment, when the backend gave us a deterministic link
   * (`reversedPaymentId`). `null` means either "not reverted" or "reverted, but the backend
   * hasn't rolled out `reversedPaymentId` yet" — in the latter case the reversal is still
   * emitted as its own top-level row, exactly as before, so nothing is ever dropped. Read
   * `status === 'reversed'` for the reverted-ness fact; read this only for the nested detail.
   */
  readonly reversal: OmegaViewerPaymentReversalDetail | null;
  /** Accessible name for the row's `role="group"` wrapper, used only when `reversal` is
   * non-null — names the whole economic event so the original and its reversal announce as
   * one unit rather than two loose amounts. */
  readonly groupAriaLabel: string;
  /** F-10: precomputed once here (via `isRevertablePayment`) rather than re-evaluated in the
   * template, per the same "no method calls in template" rule the rest of this row already
   * follows. */
  readonly revertable: boolean;
  /** F-10: `aria-label` for the row's revert button/tooltip needs the payment's date — kept
   * as its own field (rather than making the template re-derive it from `dateLabel`) so the
   * accessible name is always in sync with what's visually shown. */
  readonly revertAriaLabel: string;
  /** F-10: hint shown (as a `title` attribute, this project's established lightweight-tooltip
   * convention — see `bullet-page.html`/`installment-page.html`) for an ineligible row instead
   * of just hiding the button with no explanation. `null` when `revertable` is `true` (no hint
   * needed). */
  readonly ineligibleHint: string | null;
  readonly payment: OmegaViewerPayment;
}

function statusOf(payment: OmegaViewerPayment): OmegaViewerPaymentStatus {
  if (payment.reversal) {
    return 'reversal';
  }
  if (payment.reversed) {
    return 'reversed';
  }
  return 'normal';
}

const paymentDateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

/** Exported so the shell (`OmegaViewerComponent`) can render the same date label inside
 * `ViewerRevertConfirmDialogComponent` (F-10) without duplicating the formatter or drifting
 * from what the row itself displays — single source of truth for "how a payment date looks"
 * in this feature. */
export function formatPaymentDateLabel(paymentDate: string): string {
  return paymentDateFormatter.format(new Date(paymentDate));
}

/** `payerIds` never resolves to display names here — no id→name lookup is available in the
 * Omega Viewer's DI graph today (`PayerService` is wallet-scoped and not preloaded by the
 * shell, unlike `TagService`/`CreditCardService`; wiring it in would mean tracking "current
 * wallet" state the shell doesn't have — out of scope, confirmed with Victor). Shown as a
 * count instead, never raw ids. */
function payerLabelOf(payerIds: readonly string[]): string {
  if (payerIds.length === 0) {
    return 'Sem pagador';
  }
  if (payerIds.length === 1) {
    return '1 pagador';
  }
  return `${payerIds.length} pagadores`;
}

/**
 * Explains WHY a row has no revert button, so an ineligible row shows a hint instead of just
 * disappearing without context (F-10 acceptance criterion).
 *
 * Code review M2 previously found the `SHARED` branch unreachable here — `OmegaViewerPayment`
 * had no `kind` field, so `SHARED_PAYMENT` could only ever be discovered via the backend's 422
 * response at revert time (see `isRevertablePayment`'s prior doc comment). Now that `kind` is
 * exposed (`budget-manager-api-public` commit `2f9b678`), this branch is reachable and correct:
 * `isRevertablePayment` returns `false` for `kind === 'SHARED'`, so a SHARED row lands here.
 * The message text matches `PaymentService.describeRevertError`'s `SHARED_PAYMENT` case
 * verbatim — same wording whether the user sees it as a pre-emptive hint (this function) or,
 * for any inelegibility this predicate still can't detect ahead of time (e.g. `NO_BULLET`), as
 * a post-click 422 error.
 *
 * `NO_BULLET` remains the one gap this function still can't predict client-side (see
 * `isRevertablePayment`'s doc comment) — only `reversal`/`reversed`/`SHARED` are reachable here.
 */
function ineligibleHintOf(payment: OmegaViewerPayment): string | null {
  if (payment.reversal) {
    return 'Este pagamento é uma reversão e não pode ser revertido novamente.';
  }
  if (payment.reversed) {
    return 'Este pagamento já foi revertido.';
  }
  if (payment.kind === 'SHARED') {
    return 'Pagamentos compartilhados são revertidos pela tela de Share.';
  }
  return null;
}

function revertAriaLabelOf(dateLabel: string): string {
  return `Reverter pagamento de ${dateLabel}`;
}

/** Named builder rather than an inline template literal, matching `revertAriaLabelOf` above —
 * this UI gets translated to English on `feature/redesign`, so every user-facing sentence in
 * this file has exactly one obvious place to touch. */
function reversalLabelOf(dateLabel: string): string {
  return `Revertido em ${dateLabel}`;
}

/** Accessible name for the nested reversal's amount. Self-describing on purpose: in browse
 * mode a screen reader can land on this element alone, where a bare "-R$ 30,96" would be an
 * unexplained second amount inside the same payment. */
function reversalAmountAriaLabelOf(amountLabel: string, dateLabel: string): string {
  return `Estorno de ${amountLabel} em ${dateLabel}`;
}

/** Accessible name for a paired row's `role="group"` — names the economic event as a whole. */
function groupAriaLabelOf(dateLabel: string): string {
  return `Pagamento de ${dateLabel}, revertido`;
}

/**
 * One economic event = one top-level row.
 *
 * The backend's payment trace is an immutable append-only ledger: reverting a payment appends
 * a SECOND line (the reversal) rather than mutating the first. Both lines are legitimate and
 * neither is a duplicate, but rendering them as sibling rows of the same visual weight and the
 * same amount reads to a user as a duplicated payment — the reported bug. This pairs them:
 * the ORIGINAL is the row, and its reversal rides along as a subordinate detail.
 *
 * Complexity is O(n) in the number of trace lines — one pass to index the reversals by the id
 * they reverse, one pass to emit rows. Deliberately NOT a `find`/`filter` per row, which would
 * be O(n²) on an expense with many pay/revert cycles.
 *
 * Three cases, in the order they matter:
 * - Non-reversal line -> always emitted as a top-level row, with its reversal attached if the
 *   index has one.
 * - Reversal line WITH a matching original in this same trace -> NOT emitted at top level; it
 *   is already visible nested under its original.
 * - Reversal line with NO matching original (an orphan — `reversedPaymentId` absent because
 *   the backend hasn't rolled the field out, or the original genuinely falls outside the
 *   returned set) -> emitted as its own top-level row. Dropping a payment line silently is
 *   strictly worse than showing an odd one, and this is also the whole-trace fallback: if no
 *   reversal carries a `reversedPaymentId`, EVERY reversal is an orphan and the output is
 *   byte-for-byte the previous flat rendering. No amount/date heuristic is ever used to guess
 *   a pairing — a wrong pairing misstates the ledger, which is worse than not pairing at all.
 */
export function pairPaymentTrace(
  payments: readonly OmegaViewerPayment[],
): readonly OmegaViewerPaymentRow[] {
  const reversalsByOriginalId = indexReversalsByOriginalId(payments);
  const rows: OmegaViewerPaymentRow[] = [];

  for (const payment of payments) {
    if (isPairedReversal(payment, reversalsByOriginalId)) {
      continue;
    }
    rows.push(buildRow(payment, reversalsByOriginalId.get(payment.id) ?? null));
  }

  return rows;
}

/** Kept as the section's entry point name so call sites don't churn; pairing is now part of
 * what "map payments to rows" means. */
export const mapPaymentsToRows = pairPaymentTrace;

/**
 * Pass 1 — O(n), two linear sweeps, no nesting.
 *
 * Builds the original-id -> reversal index. Everything this function REFUSES to index is the
 * point: an unindexed reversal falls through `isPairedReversal` and renders as a top-level
 * orphan row, which is this feature's established safe fallback. Suppressing a line from the
 * top level is only ever safe when it is provably visible somewhere else.
 *
 * A pairing target must be a line that will itself be emitted as a top-level row, which is
 * why the index is keyed on NON-REVERSAL originals (`nestableOriginalIds`) rather than on mere
 * presence in the trace. Three malformed shapes are rejected here, each of which previously
 * caused a line to render nowhere or in the wrong order:
 *
 * - **Self-reference** (`id === reversedPaymentId`): a line claiming to reverse itself would
 *   nest under itself, i.e. nowhere. Rejected first, before any lookup.
 * - **Chained reversal** (a reversal OF a reversal): the inner reversal is rendered as an
 *   `OmegaViewerPaymentReversalDetail`, which has no slot of its own for a nested reversal, so
 *   nesting into it would drop the outer line AND leave the surviving row misstating the
 *   ledger (showing as reverted when the reversal was itself undone). `OmegaViewerPaymentStatus`
 *   already names this edge case as theoretically representable. Both lines stay top-level.
 * - **Two reversals claiming the same original**: `Map.set` is last-write-wins, which would
 *   nest the SECOND reversal and surface the first bare — the opposite of chronological
 *   reading. `index.has(...)` makes it first-write-wins, so the earlier reversal pairs and the
 *   later one surfaces.
 *
 * None of these are shapes the real backend produces (the ledger was verified: zero duplicated
 * `reversedPaymentId`). They are guarded because the cost of being wrong is a payment line that
 * silently renders nowhere.
 */
function indexReversalsByOriginalId(
  payments: readonly OmegaViewerPayment[],
): ReadonlyMap<string, OmegaViewerPayment> {
  const nestableOriginalIds = new Set<string>();
  for (const payment of payments) {
    if (!payment.reversal) {
      nestableOriginalIds.add(payment.id);
    }
  }

  const index = new Map<string, OmegaViewerPayment>();
  for (const payment of payments) {
    if (!payment.reversal || payment.reversedPaymentId === null) {
      warnUnpairableReversal(payment);
      continue;
    }
    // Self-reference: checked before the lookup, since a self-referencing line is present in
    // the trace by definition and would otherwise pass a presence test.
    if (payment.reversedPaymentId === payment.id) {
      continue;
    }
    // Target must be a line that actually gets emitted top-level — excludes chained reversals.
    if (!nestableOriginalIds.has(payment.reversedPaymentId)) {
      continue;
    }
    // First-write-wins: preserves chronological reading when two reversals claim one original.
    if (index.has(payment.reversedPaymentId)) {
      continue;
    }
    index.set(payment.reversedPaymentId, payment);
  }
  return index;
}

/**
 * ENHANCEMENT (review): the visual fallback is correct but was previously invisible — a
 * reversal with no `reversedPaymentId` renders flat whether the backend hasn't shipped the
 * field yet or has shipped it and violated its own invariant. Both look identical to the bug
 * being unfixed, so the rollout signal and the regression signal were the same pixel.
 *
 * Dev-mode only, and deliberately does NOT change what renders — degrade gracefully, but not
 * invisibly.
 */
function warnUnpairableReversal(payment: OmegaViewerPayment): void {
  if (payment.reversal && payment.reversedPaymentId === null && isDevMode()) {
    console.warn(
      `[omega-viewer] Payment ${payment.id} is a reversal but carries no reversedPaymentId; ` +
        'falling back to flat rendering instead of pairing it with its original.',
    );
  }
}

/**
 * True when this line is a reversal that the index accepted for pairing — i.e. it is already
 * rendered nested under its original and must not also appear as a top-level row.
 *
 * The `index.get(...) === payment` identity check is the last line of defence: it confirms
 * THIS reversal is the one the index actually holds for that original, so any reversal the
 * index declined (self-referencing, chained, or the loser of a same-original claim) surfaces
 * as its own row rather than vanishing. It is what makes the guards in
 * `indexReversalsByOriginalId` fail safe instead of fail silent.
 */
function isPairedReversal(
  payment: OmegaViewerPayment,
  index: ReadonlyMap<string, OmegaViewerPayment>,
): boolean {
  if (!payment.reversal || payment.reversedPaymentId === null) {
    return false;
  }
  return index.get(payment.reversedPaymentId) === payment;
}

function buildRow(
  payment: OmegaViewerPayment,
  reversal: OmegaViewerPayment | null,
): OmegaViewerPaymentRow {
  const dateLabel = formatPaymentDateLabel(payment.paymentDate);
  return {
    id: payment.id,
    dateLabel,
    amountLabel: formatBrl(payment.amount),
    bulletDescription: payment.bulletDescription,
    status: statusOf(payment),
    payerLabel: payerLabelOf(payment.payerIds),
    reversal: reversal === null ? null : buildReversalDetail(reversal),
    groupAriaLabel: groupAriaLabelOf(dateLabel),
    revertable: isRevertablePayment(payment),
    revertAriaLabel: revertAriaLabelOf(dateLabel),
    ineligibleHint: ineligibleHintOf(payment),
    payment,
  };
}

function buildReversalDetail(reversal: OmegaViewerPayment): OmegaViewerPaymentReversalDetail {
  const dateLabel = formatPaymentDateLabel(reversal.paymentDate);
  const amountLabel = formatBrl(reversal.amount);
  return {
    id: reversal.id,
    amountLabel,
    label: reversalLabelOf(dateLabel),
    amountAriaLabel: reversalAmountAriaLabelOf(amountLabel, dateLabel),
  };
}
