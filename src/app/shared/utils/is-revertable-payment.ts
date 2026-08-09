import { OmegaViewerPayment } from '../components/omega-viewer/models/omega-viewer-detail';

/**
 * Client-side eligibility check for the F-10 "revert payment" action
 * (`POST /payments/{id}/revert`). Business rule per the backend's `RevertPaymentUseCase`
 * (B5/B6, already merged in `budget-manager-api-public`): only a NORMAL payment, with a
 * bullet, that is not itself a reversal, and has not already been reverted, can be reverted.
 *
 * `OmegaViewerPayment` (mirrors `PaymentTraceLineDto`, confirmed in `omega-viewer-detail.ts`)
 * now carries `kind` (`NORMAL` | `SHARED`) — added to the backend DTO in
 * `budget-manager-api-public` commit `2f9b678` — so `SHARED_PAYMENT` rejections can be
 * detected here instead of only surfacing as a 422 after the user clicks. `shareId` is still
 * absent and `bulletId` is still typed as a non-nullable `string` here (unlike
 * `Payment.bulletId`, which is `string | null`), so `NO_BULLET` remains a gap this predicate
 * cannot close — that rejection reason still only ever surfaces via the backend's 422
 * `ProblemDetail` at call time (see `PaymentService.revert()`'s error handling and
 * `ViewerPaymentsSectionComponent`'s revert-error surfacing).
 */
export function isRevertablePayment(payment: OmegaViewerPayment): boolean {
  return payment.kind === 'NORMAL' && !payment.reversal && !payment.reversed;
}
