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

export function mapPaymentsToRows(
  payments: readonly OmegaViewerPayment[],
): readonly OmegaViewerPaymentRow[] {
  return payments.map((payment) => {
    const dateLabel = formatPaymentDateLabel(payment.paymentDate);
    return {
      id: payment.id,
      dateLabel,
      amountLabel: formatBrl(payment.amount),
      bulletDescription: payment.bulletDescription,
      status: statusOf(payment),
      payerLabel: payerLabelOf(payment.payerIds),
      revertable: isRevertablePayment(payment),
      revertAriaLabel: revertAriaLabelOf(dateLabel),
      ineligibleHint: ineligibleHintOf(payment),
      payment,
    };
  });
}
