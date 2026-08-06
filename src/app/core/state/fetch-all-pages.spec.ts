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

  it('errors instead of looping when totalPages is inconsistently/absurdly high but page keeps advancing', () => {
    // page legitimately advances every response (0, 1, 2, ...) but totalPages (999) implies
    // far more pages than the safety cap allows — the cap is on iterations actually
    // fetched, so it trips once MAX_PAGES (50) requests have gone out.
    const fetchPage = vi.fn((pageNumber: number) => of(page(['a'], pageNumber, 999)));
    let caught: unknown;

    fetchAllPages(fetchPage).subscribe({
      next: () => expect.fail('expected an error, got a value'),
      error: (error: unknown) => (caught = error),
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('50');
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });

  it('errors instead of looping forever when the backend never advances page (stuck at page 0)', () => {
    // Broken/inconsistent backend: every response reports page 0 with a totalPages
    // that never trips the old totalPages-based cap (3 is far below MAX_PAGES=50).
    // nextPage = response.page + 1 = 1, and 1 < 3 is true on every single response,
    // so the old cap (which only inspected the *declared* totalPages) never fired.
    const fetchPage = vi.fn(() => of(page(['a'], 0, 3)));
    let caught: unknown;

    fetchAllPages(fetchPage).subscribe({
      next: () => expect.fail('expected an error, got a value'),
      error: (error: unknown) => (caught = error),
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('50');
    // The cap must be driven by the number of pages actually fetched, not by the
    // server-declared totalPages — so it has to trip once MAX_PAGES requests have
    // gone out, regardless of what page/totalPages the server keeps reporting.
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });
});

function page<T>(content: readonly T[], pageNumber: number, totalPages: number): PagedResponse<T> {
  return { content, page: pageNumber, totalPages };
}
