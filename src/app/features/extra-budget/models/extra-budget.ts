export interface ExtraBudgetAllocation {
  readonly bulletId: string;
  readonly amount: number;
}

/** Closed union (not `string`) so a `switch`/comparison against it stays exhaustive and no
 * magic-string comparison spreads across the feature (RBM-F8). */
export type ExtraBudgetSourceType = 'MANUAL' | 'RESERVED_BUDGET_MIGRATION';

export interface ExtraBudget {
  readonly id: string;
  readonly description: string;
  readonly walletId: string;
  readonly amount: number;
  readonly currency: string;
  readonly allocations: readonly ExtraBudgetAllocation[];
  readonly deleted: boolean;
  readonly deletedAt: string | null;
  /** Optional: the backend's ExtraBudgetResponseDto does not expose this field yet (verified
   * against `ExtraBudgetResponseDto.java`/`ExtraBudgetRestMapper.java` at
   * `budget-manager-api-public` on 2026-08-21 — the domain entity `ExtraBudget.java` carries
   * `sourceType`/`sourceId`/`effectiveMonth` in full, per RBM-B1/B2, but the REST mapper's
   * `toResponse()` never maps them, and `ExtraBudgetResponseDto` has no such fields; this is not
   * in-flight parallel work, `git status`/`git log` show no pending backend change to that DTO).
   * Registered as a genuine backend gap, not silently assumed — modeled as optional here so the
   * frontend degrades gracefully (falls back to `MANUAL`, see RBM-F8) whether the field is
   * absent because the backend hasn't shipped it yet, or because a record predates it once it
   * does ship. */
  readonly sourceType?: ExtraBudgetSourceType;
}

export interface CreateExtraBudgetRequest {
  readonly description: string;
  readonly walletId: string;
  readonly amount: number;
  readonly allocations: readonly ExtraBudgetAllocation[];
}
