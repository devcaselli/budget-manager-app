/**
 * Per-tag accumulated totals for a wallet, cross-cutting Expense+Installment+Subscription.
 * Mirrors `GET /tags/accumulation?walletId=` (backend `TagAccumulationResponseDto`).
 * No rollup — a parent tag's `total` excludes its subtags' totals (backend decision, Fase 2).
 */
export interface TagAccumulationEntry {
  readonly tagId: string;
  readonly tagName: string;
  readonly parentId: string | null;
  readonly total: number;
  /** Keyed by origin: `EXPENSE` | `INSTALLMENT` | `SUBSCRIPTION`. Only origins with a nonzero contribution are present. */
  readonly breakdown: Readonly<Record<string, number>>;
}

export interface TagAccumulation {
  readonly walletId: string;
  readonly entries: readonly TagAccumulationEntry[];
}
