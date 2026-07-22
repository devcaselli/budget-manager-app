import { matchesNameOrTag, SearchableByNameOrTag } from './search-filter';

function makeItem(overrides: Partial<SearchableByNameOrTag> = {}): SearchableByNameOrTag {
  return {
    name: 'Netflix',
    tagChips: [],
    ...overrides,
  };
}

describe('matchesNameOrTag', () => {
  it('matches an empty query (no filter applied)', () => {
    expect(matchesNameOrTag(makeItem(), '')).toBe(true);
    expect(matchesNameOrTag(makeItem(), '   ')).toBe(true);
  });

  it('matches by case-insensitive name substring', () => {
    expect(matchesNameOrTag(makeItem({ name: 'Netflix' }), 'net')).toBe(true);
    expect(matchesNameOrTag(makeItem({ name: 'Netflix' }), 'NET')).toBe(true);
    expect(matchesNameOrTag(makeItem({ name: 'Netflix' }), 'spotify')).toBe(false);
  });

  it('matches by case-insensitive tag name substring', () => {
    const item = makeItem({ name: 'Netflix', tagChips: [{ name: 'Subscriptions' }] });
    expect(matchesNameOrTag(item, 'sub')).toBe(true);
    expect(matchesNameOrTag(item, 'SUB')).toBe(true);
  });

  it('matches by name OR tag, not requiring both', () => {
    const item = makeItem({ name: 'Netflix', tagChips: [{ name: 'Entertainment' }] });
    expect(matchesNameOrTag(item, 'netflix')).toBe(true);
    expect(matchesNameOrTag(item, 'entertainment')).toBe(true);
    expect(matchesNameOrTag(item, 'grocery')).toBe(false);
  });

  it('handles an item with no tags', () => {
    const item = makeItem({ name: 'Netflix', tagChips: [] });
    expect(matchesNameOrTag(item, 'netflix')).toBe(true);
    expect(matchesNameOrTag(item, 'anything')).toBe(false);
  });

  it('checks all tag chips, not just the first', () => {
    const item = makeItem({ name: 'Netflix', tagChips: [{ name: 'Food' }, { name: 'Streaming' }] });
    expect(matchesNameOrTag(item, 'streaming')).toBe(true);
  });

  it('trims whitespace from the query', () => {
    expect(matchesNameOrTag(makeItem({ name: 'Netflix' }), '  net  ')).toBe(true);
  });
});
