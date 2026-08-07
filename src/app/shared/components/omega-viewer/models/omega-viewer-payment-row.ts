import { formatBrl } from '@shared/utils/currency';

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

export function mapPaymentsToRows(
  payments: readonly OmegaViewerPayment[],
): readonly OmegaViewerPaymentRow[] {
  return payments.map((payment) => ({
    id: payment.id,
    dateLabel: paymentDateFormatter.format(new Date(payment.paymentDate)),
    amountLabel: formatBrl(payment.amount),
    bulletDescription: payment.bulletDescription,
    status: statusOf(payment),
    payerLabel: payerLabelOf(payment.payerIds),
    payment,
  }));
}
