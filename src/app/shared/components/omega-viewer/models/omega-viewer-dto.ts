import { PaymentKind } from '@features/payment/models/payment';

import { OmegaViewerItemKind } from './omega-viewer-ref';

/**
 * Wire shapes returned by the real backend Viewer endpoints (`ViewerController`,
 * `/viewer/expenses/{id}`, `/viewer/installments/{id}`, `/viewer/subscriptions/{id}` —
 * backend tasks C4/C5/C6). Field names/types mirror the Java DTOs
 * (`rest/viewer/dtos/*ResponseDto.java`) exactly; only `OmegaViewerService`'s mapping
 * functions translate these into the frontend's `OmegaViewerDetail` domain shapes.
 *
 * Dates arrive as ISO strings over the wire (`LocalDate`/`Instant`/`YearMonth` all
 * serialize to `string` in JSON) even though the Java side types them more strongly.
 */

export interface ViewerRefResponseDto {
  readonly type: OmegaViewerItemKind;
  readonly id: string;
  readonly label: string;
}

export interface TagLabelResponseDto {
  readonly id: string;
  readonly name: string;
}

export interface PaymentTraceLineResponseDto {
  readonly id: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly bulletId: string;
  readonly bulletDescription: string;
  readonly reversal: boolean;
  readonly reversed: boolean;
  readonly payerIds: readonly string[];
  /**
   * `PaymentKind` (`NORMAL` | `SHARED`) — added in `budget-manager-api-public` commit
   * `2f9b678` so the Viewer frontend can disable/hide the revert action for `SHARED`
   * (payer-quota) payments client-side, instead of only discovering the 422
   * `SHARED_PAYMENT` rejection after the user clicks. Same string-literal union already
   * used by `features/payment/models/payment.ts`'s `Payment.kind`.
   */
  readonly kind: PaymentKind;
}

export interface InstallmentProgressResponseDto {
  readonly paidInstallments: number;
  readonly remainingInstallments: number;
  readonly totalInstallments: number;
}

export interface SubscriptionVersionViewResponseDto {
  readonly effectiveMonth: string;
  readonly amount: number;
}

export interface ExpenseViewerResponseDto {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly remaining: number;
  readonly purchaseDate: string;
  readonly walletId: string;
  readonly creditCardId: string | null;
  readonly flag: string;
  readonly hidden: boolean;
  readonly details: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly TagLabelResponseDto[];
  readonly paymentTrace: readonly PaymentTraceLineResponseDto[];
  readonly refs: readonly ViewerRefResponseDto[];
}

export interface InstallmentViewerResponseDto {
  readonly id: string;
  readonly description: string;
  readonly details: string | null;
  readonly originalValue: number;
  readonly installmentValue: number;
  readonly currency: string;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly lastInstallmentDate: string;
  readonly creditCardId: string;
  readonly sourceEffectiveMonth: string;
  readonly deleted: boolean;
  readonly deletedAt: string | null;
  readonly flag: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly progress: InstallmentProgressResponseDto;
  readonly paymentTrace: readonly PaymentTraceLineResponseDto[];
  readonly refs: readonly ViewerRefResponseDto[];
}

export interface SubscriptionViewerResponseDto {
  readonly id: string;
  readonly description: string;
  readonly currency: string;
  readonly startMonth: string;
  readonly endMonth: string | null;
  readonly state: string;
  readonly creditCardId: string | null;
  readonly flag: string;
  readonly details: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly versions: readonly SubscriptionVersionViewResponseDto[];
}

/**
 * RBM-F14/RBM-F1 gate — mirrors `ReservedBudgetMigrationViewerResponseDto`/
 * `ReservedBudgetMigrationViewerOutput` exactly, as read from the real backend. `revertable` is
 * confirmed absent from this DTO (unlike the plan doc's assumption) — see the domain type's own
 * doc comment for the fallback this drives. `reverted`/`revertedAt`/`reservedBudgetActive`/
 * `reservedBudgetAmount`/`reservedBudgetRemaining` exist in the real DTO though the original
 * plan doc didn't list them; useful for reopening the viewer on an already-reverted migration
 * without a 404, but not consumed by this task's mapping (kept here for shape fidelity — the
 * file's own convention is to mirror the DTO exactly, not just the fields currently used).
 */
export interface ReservedBudgetMigrationViewerResponseDto {
  readonly extraBudgetId: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly effectiveMonth: string;
  readonly walletId: string;
  readonly bulletId: string;
  readonly bulletDescription: string;
  readonly reverted: boolean;
  readonly revertedAt: string | null;
  readonly reservedBudgetId: string;
  readonly reservedBudgetDescription: string;
  readonly reservedBudgetAmount: number;
  readonly reservedBudgetRemaining: number;
  readonly reservedBudgetActive: boolean;
  readonly refs: readonly ViewerRefResponseDto[];
}
