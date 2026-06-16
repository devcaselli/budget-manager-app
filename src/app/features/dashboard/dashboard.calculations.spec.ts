import { Subscription } from '@features/subscription/models/subscription';

import {
  heatmapLevel,
  isSubscriptionActiveInMonth,
  subscriptionAmountForMonth,
  subscriptionsTotalForMonth,
} from './dashboard.calculations';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    description: 'Streaming',
    currency: 'BRL',
    state: 'PRODUCTION',
    flag: 'NONE',
    startMonth: '2026-01',
    endMonth: null,
    versions: [{ effectiveMonth: '2026-01', amount: 30 }],
    creditCardId: null,
    ...overrides,
  };
}

describe('isSubscriptionActiveInMonth', () => {
  it('is inactive before the start month', () => {
    const sub = makeSubscription({ startMonth: '2026-03' });
    expect(isSubscriptionActiveInMonth(sub, '2026-02')).toBe(false);
  });

  it('is active on the start month', () => {
    const sub = makeSubscription({ startMonth: '2026-03' });
    expect(isSubscriptionActiveInMonth(sub, '2026-03')).toBe(true);
  });

  it('is active after the start month when not ended', () => {
    const sub = makeSubscription({ startMonth: '2026-01', endMonth: null });
    expect(isSubscriptionActiveInMonth(sub, '2026-09')).toBe(true);
  });

  it('is inactive whenever an end month is set', () => {
    const sub = makeSubscription({ startMonth: '2026-01', endMonth: '2026-12' });
    expect(isSubscriptionActiveInMonth(sub, '2026-06')).toBe(false);
  });
});

describe('subscriptionAmountForMonth', () => {
  it('returns 0 when no version applies yet', () => {
    const sub = makeSubscription({ versions: [{ effectiveMonth: '2026-05', amount: 50 }] });
    expect(subscriptionAmountForMonth(sub, '2026-04')).toBe(0);
  });

  it('returns the latest version at or before the target month', () => {
    const sub = makeSubscription({
      versions: [
        { effectiveMonth: '2026-01', amount: 30 },
        { effectiveMonth: '2026-06', amount: 45 },
        { effectiveMonth: '2026-09', amount: 60 },
      ],
    });
    expect(subscriptionAmountForMonth(sub, '2026-07')).toBe(45);
  });

  it('picks the latest version regardless of array order', () => {
    const sub = makeSubscription({
      versions: [
        { effectiveMonth: '2026-09', amount: 60 },
        { effectiveMonth: '2026-01', amount: 30 },
      ],
    });
    expect(subscriptionAmountForMonth(sub, '2026-12')).toBe(60);
  });

  it('returns 0 when there are no versions', () => {
    const sub = makeSubscription({ versions: [] });
    expect(subscriptionAmountForMonth(sub, '2026-01')).toBe(0);
  });
});

describe('subscriptionsTotalForMonth', () => {
  it('sums only active subscriptions for the month', () => {
    const active = makeSubscription({
      id: 'a',
      startMonth: '2026-01',
      versions: [{ effectiveMonth: '2026-01', amount: 30 }],
    });
    const ended = makeSubscription({
      id: 'b',
      startMonth: '2026-01',
      endMonth: '2026-03',
      versions: [{ effectiveMonth: '2026-01', amount: 100 }],
    });
    const notStarted = makeSubscription({
      id: 'c',
      startMonth: '2026-10',
      versions: [{ effectiveMonth: '2026-10', amount: 70 }],
    });

    expect(subscriptionsTotalForMonth([active, ended, notStarted], '2026-05')).toBe(30);
  });

  it('returns 0 for an empty list', () => {
    expect(subscriptionsTotalForMonth([], '2026-05')).toBe(0);
  });
});

describe('heatmapLevel', () => {
  it('returns empty for zero or negative counts', () => {
    expect(heatmapLevel(0)).toBe('');
    expect(heatmapLevel(-1)).toBe('');
  });

  it('maps low counts to discrete buckets', () => {
    expect(heatmapLevel(1)).toBe('l1');
    expect(heatmapLevel(2)).toBe('l2');
    expect(heatmapLevel(3)).toBe('l3');
  });

  it('caps at l4 for high counts', () => {
    expect(heatmapLevel(4)).toBe('l4');
    expect(heatmapLevel(99)).toBe('l4');
  });
});
