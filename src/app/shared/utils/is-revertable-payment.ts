import { OmegaViewerPayment } from '../components/omega-viewer/models/omega-viewer-detail';

/**
 * Client-side eligibility check for the F-10 "revert payment" action
 * (`POST /payments/{id}/revert`). Business rule per the backend's `RevertPaymentUseCase`
 * (B5/B6, already merged in `budget-manager-api-public`): only a NORMAL payment, with a
 * bullet, that is not itself a reversal, and has not already been reverted, can be reverted.
 *
 * `OmegaViewerPayment` (mirrors `PaymentTraceLineDto`, confirmed in `omega-viewer-detail.ts`)
 * does NOT carry every field that rule needs:
 *   - `kind` (`NORMAL` | `SHARED`) — absent. Only the `Payment` model used by
 *     `features/payment` has it; the viewer's payment-trace line never resolved it.
 *   - `shareId` — absent, same reason.
 *   - `bulletId` — present, but typed as a non-nullable `string` here (unlike `Payment.bulletId`,
 *     which is `string | null`), so a viewer payment trace line can never fail the "has a
 *     bullet" check from this shape alone.
 *
 * So this predicate can only ever evaluate what the shape actually exposes: `!reversal` and
 * `!reversed`. It CANNOT detect `SHARED_PAYMENT` or `NO_BULLET` client-side — those two
 * rejection reasons only ever surface via the backend's 422 `ProblemDetail` at call time (see
 * `PaymentService.revert()`'s error handling and `ViewerPaymentsSectionComponent`'s revert-error
 * surfacing). This is a known, accepted gap: extending `OmegaViewerPayment` with `kind`/
 * `shareId` to close it is a mapping-layer change outside F-10's scope (would need a matching
 * backend DTO change too) — not attempted here.
 */
export function isRevertablePayment(payment: OmegaViewerPayment): boolean {
  return !payment.reversal && !payment.reversed;
}
