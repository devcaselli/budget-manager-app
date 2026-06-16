export type ExpenseSortOrder = 'DATE_DESC' | 'DATE_ASC' | 'VALUE_ASC' | 'VALUE_DESC';
export type ExpensePaymentStatus = 'ALL' | 'PAID' | 'OPEN';

/** Fields of an expense list item the filter/sort pipeline depends on. */
export interface FilterableExpense {
  readonly name: string;
  readonly purchaseDate: string;
  readonly creditCardId: string | null;
  readonly remainingValue: number;
  readonly statusLabel: string;
}

export interface ExpenseFilterCriteria {
  readonly search?: string;
  readonly creditCardId?: string;
  readonly sortOrder?: ExpenseSortOrder;
  readonly paymentStatus?: ExpensePaymentStatus;
  readonly startDate?: string;
  readonly endDate?: string;
}

function matchesCriteria<T extends FilterableExpense>(
  item: T,
  query: string,
  criteria: ExpenseFilterCriteria,
): boolean {
  const { creditCardId, paymentStatus, startDate, endDate } = criteria;

  if (query && !item.name.toLowerCase().includes(query)) return false;
  if (creditCardId && item.creditCardId !== creditCardId) return false;
  if (paymentStatus === 'PAID' && item.statusLabel !== 'PAID') return false;
  if (paymentStatus === 'OPEN' && item.statusLabel !== 'OPEN') return false;
  if (startDate && item.purchaseDate < startDate) return false;
  if (endDate && item.purchaseDate > endDate) return false;

  return true;
}

function compareBy<T extends FilterableExpense>(
  sortOrder: ExpenseSortOrder,
): (left: T, right: T) => number {
  switch (sortOrder) {
    case 'DATE_ASC':
      return (l, r) => l.purchaseDate.localeCompare(r.purchaseDate);
    case 'VALUE_ASC':
      return (l, r) => l.remainingValue - r.remainingValue;
    case 'VALUE_DESC':
      return (l, r) => r.remainingValue - l.remainingValue;
    case 'DATE_DESC':
    default:
      return (l, r) => r.purchaseDate.localeCompare(l.purchaseDate);
  }
}

/**
 * Apply search/card/status/date filters then sort. Pure: returns a new array
 * and never mutates the input.
 */
export function filterAndSortExpenses<T extends FilterableExpense>(
  items: readonly T[],
  criteria: ExpenseFilterCriteria,
): readonly T[] {
  const query = (criteria.search ?? '').trim().toLowerCase();
  const matched = items.filter((item) => matchesCriteria(item, query, criteria));
  return [...matched].sort(compareBy(criteria.sortOrder ?? 'DATE_DESC'));
}
