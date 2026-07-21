import { SubscriptionVersion } from '../models/subscription';
import { resolveCurrentAmount } from './resolve-current-amount';

describe('resolveCurrentAmount', () => {
  it('returns 0 when there are no versions', () => {
    expect(resolveCurrentAmount([], '2026-07')).toBe(0);
  });

  it('returns the single version amount regardless of target month', () => {
    const versions: SubscriptionVersion[] = [{ effectiveMonth: '2026-06', amount: 70 }];
    expect(resolveCurrentAmount(versions, '2026-09')).toBe(70);
  });

  it('resolves the amount in effect for the target month (Netflix case)', () => {
    // junho=70, julho em diante=30
    const versions: SubscriptionVersion[] = [
      { effectiveMonth: '2026-06', amount: 70 },
      { effectiveMonth: '2026-07', amount: 30 },
    ];
    expect(resolveCurrentAmount(versions, '2026-06')).toBe(70);
    expect(resolveCurrentAmount(versions, '2026-07')).toBe(30);
    expect(resolveCurrentAmount(versions, '2026-12')).toBe(30);
  });

  it('does NOT pick a future version (the bug that was fixed)', () => {
    // Sorted-desc top would be the 2027-01 version; resolving by current month must ignore it.
    const versions: SubscriptionVersion[] = [
      { effectiveMonth: '2026-01', amount: 50 },
      { effectiveMonth: '2027-01', amount: 90 },
    ];
    expect(resolveCurrentAmount(versions, '2026-07')).toBe(50);
  });

  it('falls back to the earliest version when all versions are in the future', () => {
    const versions: SubscriptionVersion[] = [
      { effectiveMonth: '2026-09', amount: 40 },
      { effectiveMonth: '2026-11', amount: 60 },
    ];
    expect(resolveCurrentAmount(versions, '2026-07')).toBe(40);
  });

  it('is order-independent for the input array', () => {
    const versions: SubscriptionVersion[] = [
      { effectiveMonth: '2026-07', amount: 30 },
      { effectiveMonth: '2026-06', amount: 70 },
    ];
    expect(resolveCurrentAmount(versions, '2026-07')).toBe(30);
  });

  it('matches exactly on the boundary month', () => {
    const versions: SubscriptionVersion[] = [
      { effectiveMonth: '2026-05', amount: 10 },
      { effectiveMonth: '2026-08', amount: 20 },
    ];
    expect(resolveCurrentAmount(versions, '2026-08')).toBe(20);
    expect(resolveCurrentAmount(versions, '2026-07')).toBe(10);
  });
});
