import { PendingReview } from '@features/pending-review/models/pending-review';

/** Mirrors `SyncReportResponseDto` — per-run counts of one bank-SMS ingest run. */
export interface SyncReport {
  readonly created: number;
  readonly skipped: number;
  readonly fallback: number;
  readonly errors: number;
}

/**
 * Mirrors `SyncIngestResponseDto` (backend slice `sync`, confirmed against
 * `SyncIngestResponseDto.java`/`SyncController.java`, commit `38cab7e`): the run's
 * `SyncReportResponseDto` plus the current full `PENDING_REVIEW` list for the owner
 * (same `PendingExpenseReviewResponseDto` modeled as `PendingReview`), so the client
 * can render the review screen from this single round-trip instead of a follow-up
 * `GET /pending-reviews`.
 */
export interface SyncIngestResult {
  readonly report: SyncReport;
  readonly pendingReviews: readonly PendingReview[];
}
