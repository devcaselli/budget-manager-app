/** Minimal shape a search-filterable list item needs: a name and its assigned tag chips. */
export interface SearchableByNameOrTag {
  readonly name: string;
  readonly tagChips: readonly { readonly name: string }[];
}

/**
 * True if `query` (case-insensitive, untrimmed queries should be trimmed by the caller)
 * is a substring of the item's name OR any of its assigned tag names. Empty query always
 * matches (no filter applied).
 *
 * Shared between Installment and Subscription, which have identical item shape for this
 * purpose (`name` + `tagChips`) and identical expected behavior (OR match, client-side,
 * no HTTP). Expense has its own pipeline (`filterAndSortExpenses`) combining this same
 * OR-by-name-or-tag logic with other filters (card/status/date) — not reused here to avoid
 * forcing an unrelated interface onto an already-tested, differently-shaped function.
 */
export function matchesNameOrTag(item: SearchableByNameOrTag, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (item.name.toLowerCase().includes(normalized)) return true;
  return item.tagChips.some((chip) => chip.name.toLowerCase().includes(normalized));
}
