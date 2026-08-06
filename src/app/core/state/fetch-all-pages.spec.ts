import { of, throwError } from 'rxjs';

import { fetchAllPages, PagedResponse } from './fetch-all-pages';

describe('fetchAllPages', () => {
  it('emits an empty array when totalPages is 0', () => {
    const fetchPage = vi.fn(() => of(page<string>([], 0, 0)));
    let result: readonly string[] | undefined;

    fetchAllPages(fetchPage).subscribe((value) => (result = value));

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0);
  });

  it('resolves with a single page without requesting a second one', () => {
    const fetchPage = vi.fn(() => of(page(['a', 'b'], 0, 1)));
    let result: readonly string[] | undefined;

    fetchAllPages(fetchPage).subscribe((value) => (result = value));

    expect(result).toEqual(['a', 'b']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('concatenates 3 pages in the correct order', () => {
    const pages = [page(['a', 'b'], 0, 3), page(['c', 'd'], 1, 3), page(['e'], 2, 3)];
    const fetchPage = vi.fn((pageNumber: number) => of(pages[pageNumber]));
    let result: readonly string[] | undefined;

    fetchAllPages(fetchPage).subscribe((value) => (result = value));

    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 2);
  });

  it('propagates an error raised mid-chain instead of swallowing it', () => {
    const boom = new Error('page 1 failed');
    const fetchPage = vi.fn((pageNumber: number) =>
      pageNumber === 0 ? of(page(['a'], 0, 3)) : throwError(() => boom),
    );
    let caught: unknown;

    fetchAllPages(fetchPage).subscribe({
      next: () => expect.fail('expected an error, got a value'),
      error: (error: unknown) => (caught = error),
    });

    expect(caught).toBe(boom);
  });

  it('errors instead of looping when totalPages is inconsistently/absurdly high', () => {
    const fetchPage = vi.fn(() => of(page(['a'], 0, 999)));
    let caught: unknown;

    fetchAllPages(fetchPage).subscribe({
      next: () => expect.fail('expected an error, got a value'),
      error: (error: unknown) => (caught = error),
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('999');
    // Only the first page should ever be requested — the cap trips before a second
    // request is attempted, so this never becomes an unbounded loop.
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

function page<T>(content: readonly T[], pageNumber: number, totalPages: number): PagedResponse<T> {
  return { content, page: pageNumber, totalPages };
}
