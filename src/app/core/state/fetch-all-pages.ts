import { EMPTY, expand, map, Observable, reduce, throwError } from 'rxjs';

/**
 * Minimal structural shape shared by every feature's `Paged*Response` DTO
 * (`PagedExpenseResponse`, `PagedPaymentResponse`, ...). Any response with these
 * fields works with {@link fetchAllPages} without a feature-specific adapter.
 */
export interface PagedResponse<T> {
  readonly content: readonly T[];
  readonly page: number;
  readonly totalPages: number;
}

/**
 * Safety cap on the number of pages fetched per call. Guards against an
 * inconsistent/absurd `totalPages` from the backend (or a future bug) turning
 * this into an unbounded request loop.
 */
const MAX_PAGES = 50;

/**
 * Fetches every page of a paginated endpoint and concatenates their `content`
 * into a single array, in page order.
 *
 * Starts at page 0, reads `totalPages` off the first response, then keeps
 * requesting subsequent pages via RxJS `expand` until all pages have been
 * fetched. A single-page result (or an empty one) short-circuits immediately.
 *
 * @param fetchPage fetches one page given its 0-based page index. Must be the
 * same primitive already used for single-page requests (e.g.
 * `ExpenseService.findByWalletId`) — this helper only supplies the looping.
 * @returns the concatenated `content` of every page, in order.
 * @throws if `totalPages` exceeds the {@link MAX_PAGES} safety cap, or if any
 * underlying page request errors (the error propagates unmodified).
 */
export function fetchAllPages<T>(
  fetchPage: (page: number) => Observable<PagedResponse<T>>,
): Observable<readonly T[]> {
  return fetchPage(0).pipe(
    expand((response) => {
      if (response.totalPages > MAX_PAGES) {
        return throwError(
          () =>
            new Error(
              `fetchAllPages: totalPages (${response.totalPages}) exceeds the safety cap of ${MAX_PAGES} pages — refusing to loop.`,
            ),
        );
      }

      const nextPage = response.page + 1;
      return nextPage < response.totalPages ? fetchPage(nextPage) : EMPTY;
    }),
    reduce<PagedResponse<T>, T[]>((accumulated, response) => {
      accumulated.push(...response.content);
      return accumulated;
    }, []),
    map((accumulated) => accumulated as readonly T[]),
  );
}
