import { toTagChips } from './tag-chips';

describe('toTagChips', () => {
  it('resolves tag ids to {id, name} chips via the map', () => {
    const map = new Map([['tag-1', 'Food'], ['tag-2', 'Transport']]);
    expect(toTagChips(['tag-1', 'tag-2'], map)).toEqual([
      { id: 'tag-1', name: 'Food' },
      { id: 'tag-2', name: 'Transport' },
    ]);
  });

  it('returns an empty array for no tag ids', () => {
    expect(toTagChips([], new Map())).toEqual([]);
  });

  it('falls back to a neutral placeholder, never the raw id, on a map miss', () => {
    const map = new Map([['tag-1', 'Food']]);
    expect(toTagChips(['tag-1', 'unknown-id'], map)).toEqual([
      { id: 'tag-1', name: 'Food' },
      { id: 'unknown-id', name: '—' },
    ]);
  });

  it('preserves input order', () => {
    const map = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);
    expect(toTagChips(['c', 'a', 'b'], map).map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});
