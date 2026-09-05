import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  of,
  ReplaySubject,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import { CreateShareRequest, Share } from '../models/share';

@Injectable({
  providedIn: 'root',
})
export class ShareService {
  private readonly http = inject(HttpClient);
  private readonly sharesUrl = `${environment.apiUrl}/shares`;
  private readonly walletsUrl = `${environment.apiUrl}/wallets`;

  private readonly sharesSubject = new BehaviorSubject<readonly Share[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly revertingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  private readonly walletSharesSubject = new BehaviorSubject<readonly Share[]>([]);
  private readonly walletSharesLoadingSubject = new BehaviorSubject(false);
  private readonly walletSharesErrorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadByWalletIdTrigger$ = new Subject<string | null>();

  readonly shares$ = this.sharesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly reverting$ = this.revertingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  readonly walletShares$ = this.walletSharesSubject.asObservable();
  readonly walletSharesLoading$ = this.walletSharesLoadingSubject.asObservable();
  readonly walletSharesError$ = this.walletSharesErrorSubject.asObservable();

  constructor() {
    /**
     * Bug fix (2026-09-05, Victor's report — Payers screen "Total Due" showing
     * a stale, previous-month value): same root cause as
     * `PayerService.loadByWalletId` — this used to fire an independent
     * `.subscribe()` per call with no cancellation, so a fast wallet (month)
     * switch could let the OLD wallet's `GET /wallets/{id}/shares` resolve
     * AFTER the NEW wallet's, overwriting `walletSharesSubject` with the
     * previous month's shares. `switchMap` cancels the stale in-flight
     * request the instant a new `walletId` is requested.
     */
    this.loadByWalletIdTrigger$
      .pipe(
        tap(() => {
          this.walletSharesLoadingSubject.next(true);
          this.walletSharesErrorSubject.next(null);
        }),
        switchMap((walletId) => {
          if (!walletId) {
            this.walletSharesSubject.next([]);
            this.walletSharesLoadingSubject.next(false);
            return EMPTY;
          }
          return this.http.get<Share[]>(`${this.walletsUrl}/${walletId}/shares`).pipe(
            tap((shares) => this.walletSharesSubject.next(shares)),
            catchError(() => {
              this.walletSharesErrorSubject.next(
                'Não foi possível carregar os compartilhamentos da carteira.',
              );
              return of(null);
            }),
            finalize(() => this.walletSharesLoadingSubject.next(false)),
          );
        }),
      )
      .subscribe();
  }

  /**
   * Loads ALL of the authenticated owner's shares — ACTIVE and REVERTED, across every
   * wallet, with no effectiveness-by-month filtering. This is the owner-scoped endpoint
   * (GET /shares); a wallet-scoped variant also exists (see `loadByWalletId`/`walletShares$`
   * below) — the two are deliberately not interchangeable:
   *
   * - Use `shares$` for: the History tab (needs REVERTED, which the wallet-scoped endpoint
   *   never returns) and the "stopped" slice of the Active tab (a share stopped from the
   *   current month is filtered OUT by the wallet-scoped endpoint's `isEffectiveFor` check,
   *   by definition — it only exists here). Also still used by `ExpensePage` to cross-reference
   *   `hasShare`/`shareSummary` by `sourceId` across all wallets — do not repurpose this
   *   source's semantics without checking that consumer.
   * - Use `walletShares$` for: the "currently effective" slice of the Active tab. The backend
   *   already filters to ACTIVE + effective-for-the-wallet's-month across all 3 source types
   *   (EXPENSE/SUBSCRIPTION/INSTALLMENT) — do not re-filter by status client-side, that would
   *   mask a backend regression instead of surfacing it.
   */
  loadAll(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .get<Share[]>(this.sharesUrl)
      .pipe(
        tap((shares) => this.sharesSubject.next(shares)),
        catchError(() => {
          this.errorSubject.next('Não foi possível carregar os compartilhamentos.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  /**
   * Loads the shares effective for one wallet (GET /wallets/{walletId}/shares) — ACTIVE,
   * across all 3 source types, already filtered by `Share.isEffectiveFor(wallet's month)`
   * server-side. See `loadAll()`'s doc for when to use this vs. the owner-scoped source.
   *
   * `walletId === null` emits `[]` without an HTTP call (same pattern as
   * `PayerService.loadByWalletId`). Uses its own loading/error subjects — separate from
   * `loading$`/`error$` — so a failure on one source never silently clobbers the other's
   * state (both sources are polled independently by the Active tab).
   */
  loadByWalletId(walletId: string | null): void {
    this.loadByWalletIdTrigger$.next(walletId);
  }

  create(request: CreateShareRequest): Observable<Share> {
    const subject = new ReplaySubject<Share>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Share>(this.sharesUrl, request)
      .pipe(
        tap({
          next: (created) => {
            const current = this.sharesSubject.getValue();
            this.sharesSubject.next([
              created,
              ...current.filter((share) => share.id !== created.id),
            ]);
          },
          error: (error: unknown) => this.errorSubject.next(this.createErrorMessage(error)),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (created) => {
          subject.next(created);
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  /**
   * Extracts a user-facing message from a failed `create()` call, falling back to a
   * generic one when the backend didn't send anything usable. Without this, every
   * creation error (including the `Expense.pay()` cent-exact drift on EXPENSE shares —
   * achado nº 5 of the plan, backend Task 3's `Share.balanceTolerance` absorbs the common
   * case but not every case) surfaced as an opaque "não foi possível criar", leaving the
   * user with no idea what to fix.
   *
   * The backend's `GlobalExceptionHandler` (infra/.../rest/advice/GlobalExceptionHandler.java)
   * returns RFC 7807 `ProblemDetail` bodies, where the human-readable message is the
   * `detail` field — confirmed directly in `GlobalExceptionHandlerTest.java` (every
   * `jsonPath("$.detail")` assertion in that file). This is `error.error?.detail`, not
   * `error.error?.message` — the frontend-tasks.md draft assumed `.message` before this was
   * checked against the real backend contract; there is no `.message` field in this API's
   * error responses.
   */
  private createErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const detail = (error.error as { detail?: unknown } | null)?.detail;
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail;
      }
    }
    return 'Não foi possível criar o compartilhamento.';
  }

  /**
   * Reverting a share must move it out of the Active tab and into History — with two
   * sources feeding the Active tab (this method's own `loadAll()` reload plus
   * `walletShares$`), one `loadAll()` call is no longer sufficient on its own. This
   * method deliberately keeps reloading only `shares$` (as before) rather than also
   * calling `loadByWalletId` here: the service has no notion of "the currently selected
   * wallet" (by design — `walletShares$` is populated by whatever `walletId` the last
   * caller passed in, not tracked state), so re-deriving it here would mean either
   * threading a `walletId` through `revert()` that most callers don't have, or guessing.
   * The caller (`SharePage`, Task 3) already subscribes to `revert()`'s result and knows
   * the selected wallet — it reloads `walletShares$` itself on success. Do not add a
   * `loadByWalletId` call here without also removing the page-level reload, or a revert
   * will trigger two wallet-scoped requests.
   */
  revert(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.revertingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .post<void>(`${this.sharesUrl}/${id}/revert`, null)
      .pipe(
        tap({
          next: () => this.loadAll(),
          error: () => this.errorSubject.next('Não foi possível reverter o compartilhamento.'),
        }),
        finalize(() => this.revertingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          subject.next();
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }
}
