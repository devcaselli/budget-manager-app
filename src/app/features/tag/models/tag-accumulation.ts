/** Mirrors backend `AccumulationSourceType` — the origin of a slice of a tag's accumulated total. */
export type TagAccumulationOrigin = 'EXPENSE' | 'INSTALLMENT' | 'SUBSCRIPTION';

/**
 * Per-tag accumulated totals for a wallet, cross-cutting Expense+Installment+Subscription.
 * Mirrors `GET /tags/accumulation?walletId=` (backend `TagAccumulationResponseDto`).
 *
 * Fase 3 rollup (1 level only, no recursion — hierarchy stays tag→subtag):
 * - For a **parent tag** (`parentId === null`): `total` is the aggregate
 *   (`directTotal + inheritedTotal`); `directTotal` is items tagged directly on it;
 *   `inheritedTotal` is the sum of all its subtags' `directTotal`.
 * - For a **subtag** (`parentId !== null`): `total === directTotal` (identical to Fase 2's
 *   isolated sum) and `inheritedTotal` is always `0` — a subtag has no children to inherit from.
 * - Manual double-tagging (an item tagged on both a parent and its own subtag) is NOT
 *   deduplicated — confirmed intentional by Victor (backend commit `48a921f`).
 *
 * All three fields are always present (never optional/undefined) on every entry — the backend
 * DTO has no nullable rollup fields. Which meaning applies (parent vs. subtag) is determined by
 * `parentId`, not by field presence.
 */
export interface TagAccumulationEntry {
  readonly tagId: string;
  readonly tagName: string;
  readonly parentId: string | null;
  readonly total: number;
  readonly directTotal: number;
  readonly inheritedTotal: number;
  /** Only origins with a nonzero contribution are present. */
  readonly breakdown: Readonly<Partial<Record<TagAccumulationOrigin, number>>>;
}

export interface TagAccumulation {
  readonly walletId: string;
  readonly entries: readonly TagAccumulationEntry[];
}
