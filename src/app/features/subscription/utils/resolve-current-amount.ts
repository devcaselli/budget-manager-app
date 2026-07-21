import { SubscriptionVersion } from '../models/subscription';

/**
 * Resolves the amount in effect for a given target month, following the
 * temporal-versioning rule: the amount in effect is the one from the most
 * recent version whose `effectiveMonth` does NOT exceed the target month
 * (i.e. the last version with `effectiveMonth <= targetMonth`).
 *
 * Months are compared as `YYYY-MM` strings — lexicographic order matches
 * chronological order for this fixed-width format, so no Date parsing is needed.
 *
 * Edge case: when every version is effective in the future (the subscription
 * hasn't started yet at `targetMonth`), the earliest version is returned — that
 * is the amount the subscription will start at, the most meaningful value to show.
 *
 * @returns the resolved amount, or 0 when there are no versions.
 * Complexity: O(n) time, O(1) space — a single pass, no sorting required.
 */
export function resolveCurrentAmount(
  versions: readonly SubscriptionVersion[],
  targetMonth: string,
): number {
  if (versions.length === 0) return 0;

  let effective: SubscriptionVersion | null = null;
  let earliest: SubscriptionVersion = versions[0];

  for (const version of versions) {
    if (version.effectiveMonth < earliest.effectiveMonth) {
      earliest = version;
    }
    const isApplicable = version.effectiveMonth <= targetMonth;
    const isMoreRecent = !effective || version.effectiveMonth > effective.effectiveMonth;
    if (isApplicable && isMoreRecent) {
      effective = version;
    }
  }

  return Number((effective ?? earliest).amount);
}
