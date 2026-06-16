import { Subscription } from '@features/subscription/models/subscription';

/**
 * Pure calculation helpers for the dashboard. Extracted from the component so
 * the financial math is unit-testable without TestBed and free of view state.
 */

/**
 * A subscription counts as "active" in a month only while it has no end month
 * and the month is at or after its start. Ended subscriptions never count.
 */
export function isSubscriptionActiveInMonth(
  subscription: Subscription,
  monthKey: string,
): boolean {
  if (subscription.endMonth !== null) return false;
  return monthKey >= subscription.startMonth;
}

/**
 * Resolve the amount in effect for a month: the latest version whose
 * effectiveMonth is at or before the target month. Returns 0 when none apply.
 */
export function subscriptionAmountForMonth(
  subscription: Subscription,
  monthKey: string,
): number {
  let latest: { effectiveMonth: string; amount: number } | null = null;

  for (const version of subscription.versions) {
    if (version.effectiveMonth > monthKey) continue;
    if (!latest || version.effectiveMonth > latest.effectiveMonth) {
      latest = version;
    }
  }

  return Number(latest?.amount ?? 0);
}

/** Total active-subscription cost for a given month. */
export function subscriptionsTotalForMonth(
  subscriptions: readonly Subscription[],
  monthKey: string,
): number {
  return subscriptions.reduce(
    (sum, sub) =>
      sum +
      (isSubscriptionActiveInMonth(sub, monthKey)
        ? subscriptionAmountForMonth(sub, monthKey)
        : 0),
    0,
  );
}

/** Heatmap intensity bucket for a transaction count. */
export function heatmapLevel(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return 'l1';
  if (count === 2) return 'l2';
  if (count === 3) return 'l3';
  return 'l4';
}
