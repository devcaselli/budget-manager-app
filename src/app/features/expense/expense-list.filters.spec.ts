import { FilterableExpense, filterAndSortExpenses } from './expense-list.filters';

function makeItem(overrides: Partial<FilterableExpense> = {}): FilterableExpense {
  return {
    name: 'Groceries',
    purchaseDate: '2026-05-10',
    creditCardId: 'card-1',
    remainingValue: 100,
    statusLabel: 'OPEN',
    ...overrides,
  };
}

describe('filterAndSortExpenses', () => {
  it('returns all items sorted by date desc by default', () => {
    const a = makeItem({ name: 'A', purchaseDate: '2026-05-01' });
    const b = makeItem({ name: 'B', purchaseDate: '2026-05-20' });

    const result = filterAndSortExpenses([a, b], {});

    expect(result.map((i) => i.name)).toEqual(['B', 'A']);
  });

  it('filters by case-insensitive name search', () => {
    const items = [makeItem({ name: 'Netflix' }), makeItem({ name: 'Groceries' })];
    const result = filterAndSortExpenses(items, { search: 'net' });
    expect(result.map((i) => i.name)).toEqual(['Netflix']);
  });

  it('trims whitespace from the search query', () => {
    const items = [makeItem({ name: 'Netflix' }), makeItem({ name: 'Groceries' })];
    expect(filterAndSortExpenses(items, { search: '  net  ' })).toHaveLength(1);
  });

  it('filters by credit card', () => {
    const items = [makeItem({ creditCardId: 'card-1' }), makeItem({ creditCardId: 'card-2' })];
    const result = filterAndSortExpenses(items, { creditCardId: 'card-2' });
    expect(result).toHaveLength(1);
    expect(result[0].creditCardId).toBe('card-2');
  });

  it('filters by PAID payment status', () => {
    const items = [makeItem({ statusLabel: 'PAID' }), makeItem({ statusLabel: 'OPEN' })];
    expect(filterAndSortExpenses(items, { paymentStatus: 'PAID' })).toHaveLength(1);
  });

  it('filters by OPEN payment status', () => {
    const items = [makeItem({ statusLabel: 'PAID' }), makeItem({ statusLabel: 'OPEN' })];
    expect(filterAndSortExpenses(items, { paymentStatus: 'OPEN' })).toHaveLength(1);
  });

  it('ignores payment status when ALL', () => {
    const items = [makeItem({ statusLabel: 'PAID' }), makeItem({ statusLabel: 'OPEN' })];
    expect(filterAndSortExpenses(items, { paymentStatus: 'ALL' })).toHaveLength(2);
  });

  it('filters by inclusive start and end date', () => {
    const items = [
      makeItem({ name: 'before', purchaseDate: '2026-04-30' }),
      makeItem({ name: 'inside', purchaseDate: '2026-05-15' }),
      makeItem({ name: 'after', purchaseDate: '2026-06-01' }),
    ];
    const result = filterAndSortExpenses(items, { startDate: '2026-05-01', endDate: '2026-05-31' });
    expect(result.map((i) => i.name)).toEqual(['inside']);
  });

  it('sorts by date ascending', () => {
    const items = [
      makeItem({ name: 'new', purchaseDate: '2026-05-20' }),
      makeItem({ name: 'old', purchaseDate: '2026-05-01' }),
    ];
    const result = filterAndSortExpenses(items, { sortOrder: 'DATE_ASC' });
    expect(result.map((i) => i.name)).toEqual(['old', 'new']);
  });

  it('sorts by remaining value ascending and descending', () => {
    const items = [
      makeItem({ name: 'big', remainingValue: 500 }),
      makeItem({ name: 'small', remainingValue: 50 }),
    ];
    expect(filterAndSortExpenses(items, { sortOrder: 'VALUE_ASC' }).map((i) => i.name)).toEqual([
      'small',
      'big',
    ]);
    expect(filterAndSortExpenses(items, { sortOrder: 'VALUE_DESC' }).map((i) => i.name)).toEqual([
      'big',
      'small',
    ]);
  });

  it('combines multiple criteria', () => {
    const items = [
      makeItem({ name: 'Netflix', creditCardId: 'card-1', statusLabel: 'OPEN', purchaseDate: '2026-05-10' }),
      makeItem({ name: 'Netflix', creditCardId: 'card-2', statusLabel: 'OPEN', purchaseDate: '2026-05-11' }),
      makeItem({ name: 'Spotify', creditCardId: 'card-1', statusLabel: 'OPEN', purchaseDate: '2026-05-12' }),
    ];
    const result = filterAndSortExpenses(items, { search: 'netflix', creditCardId: 'card-1' });
    expect(result).toHaveLength(1);
    expect(result[0].creditCardId).toBe('card-1');
  });

  it('does not mutate the input array', () => {
    const items = [makeItem({ purchaseDate: '2026-05-01' }), makeItem({ purchaseDate: '2026-05-20' })];
    const snapshot = [...items];
    filterAndSortExpenses(items, { sortOrder: 'DATE_ASC' });
    expect(items).toEqual(snapshot);
  });
});
