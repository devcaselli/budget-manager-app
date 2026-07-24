/** Mirrors `PendingExpenseReviewStatus` (backend domain enum). */
export type PendingReviewStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'DISCARDED';

/**
 * Mirrors `PendingExpenseReviewResponseDto` exactly as implemented (backend commit `38cab7e`).
 * `resolvedName` already comes pre-resolved from the backend (`nameOverride ?? merchant`) —
 * the UI should prefer it over `merchant`, which is only the raw ingest fallback.
 */
export interface PendingReview {
  readonly id: string;
  readonly sourcePendingId: string;
  readonly bank: string;
  readonly cardLast4: string;
  readonly cardLabel: string;
  readonly amount: number;
  readonly currency: string;
  readonly merchant: string;
  readonly purchaseAt: string;
  readonly nameOverride: string | null;
  readonly resolvedName: string;
  readonly installmentNumber: number | null;
  readonly status: PendingReviewStatus;
}

/**
 * Mirrors `PendingExpenseReviewPatchRequestDto` — both fields independently optional
 * (partial update, same pattern as `PatchExpenseRequest`/`ExpenseService.patch`).
 *
 * Contract note: `nameOverride: ''` clears the override on the backend (falls back to
 * `merchant`); there is no way to clear `installmentNumber` back to `null` via this DTO
 * (out of backend scope — do not build a UI path for it).
 */
export interface PendingReviewPatchRequest {
  readonly nameOverride?: string;
  readonly installmentNumber?: number;
}

/** Mirrors `ConfirmPendingReviewsResponseDto.ConfirmedItemDto`. */
export interface ConfirmedPendingReview {
  readonly pendingExpenseReviewId: string;
  readonly expenseId: string;
}

/** Mirrors `ConfirmPendingReviewsResponseDto.FailedItemDto`. */
export interface FailedPendingReview {
  readonly pendingExpenseReviewId: string;
  readonly errorMessage: string;
}

/** Mirrors `ConfirmPendingReviewsResponseDto` — always HTTP 200, partial failure is not an HTTP error. */
export interface ConfirmPendingReviewsResult {
  readonly confirmed: readonly ConfirmedPendingReview[];
  readonly failed: readonly FailedPendingReview[];
}

/**
 * Mirrors `SyncIngestResponseDto` (backend slice `sync`). Placeholder field names —
 * Task 2 confirms/corrects these against the real DTO before this type is relied upon
 * outside Task 1.
 */
export interface SyncIngestResult {
  readonly report: SyncReport;
  readonly pendingReviews: readonly PendingReview[];
}

/**
 * Local structural mirror of `SyncReport` (`@features/sync/models/sync`) to avoid Task 1
 * depending on the `sync` feature. Task 2 reconciles this with the real `SyncReport` type
 * and removes the duplication if the shapes stay identical.
 */
export interface SyncReport {
  readonly created: number;
  readonly skipped: number;
  readonly fallback: number;
  readonly errors: number;
}
