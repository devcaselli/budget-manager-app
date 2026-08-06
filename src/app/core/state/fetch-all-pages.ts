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
 * Safety cap on the number of pages actually *fetched* per call (not on the
 * `totalPages` a response declares). Guards against a backend that never
 * advances `page` — e.g. always responding `page: 0` with a fixed,
 * unremarkable `totalPages` — which would otherwise recurse forever, since
 * `nextPage < totalPages` stays true on every single response. Counting real
 * iterations (instead of trusting the server-declared `totalPages`) is what
 * makes this cap effective against that class of bug.
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
 * @throws if more than {@link MAX_PAGES} pages are actually fetched, or if
 * any underlying page request errors (the error propagates unmodified).
 */
export function fetchAllPages<T>(
  fetchPage: (page: number) => Observable<PagedResponse<T>>,
): Observable<readonly T[]> {
  let fetchedPages = 1; // the initial fetchPage(0) below counts as the first fetch.

  return fetchPage(0).pipe(
    expand((response) => {
      const nextPage = response.page + 1;
      if (nextPage >= response.totalPages) {
        return EMPTY;
      }

      // Counts pages actually requested, not the server-declared totalPages — a
      // backend stuck reporting the same page (e.g. always page: 0) would never
      // trip a totalPages-only check, since nextPage < totalPages stays true
      // forever. This is the guard that makes the cap effective in that case.
      if (++fetchedPages > MAX_PAGES) {
        return throwError(
          () =>
            new Error(
              `fetchAllPages: exceeded the safety cap of ${MAX_PAGES} pages fetched — refusing to keep looping. This usually means the backend isn't advancing 'page' correctly.`,
            ),
        );
      }

      return fetchPage(nextPage);
    }),
    reduce<PagedResponse<T>, T[]>((accumulated, response) => {
      accumulated.push(...response.content);
      return accumulated;
    }, []),
    map((accumulated) => accumulated as readonly T[]),
  );
}
