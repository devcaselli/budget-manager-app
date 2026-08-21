import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  map,
  Observable,
  ReplaySubject,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';
import { fetchAllPages } from '@core/state/fetch-all-pages';
import { LoadingCounter } from '@core/state/loading-counter';

import {
  CreateReservedBudgetMigrationRequest,
  CreateReservedBudgetRequest,
  LinkReservedBudgetSourceRequest,
  PagedReservedBudgetResponse,
  ReservedBudget,
  ReservedBudgetDeleteMode,
  ReservedBudgetLinkSourceType,
  UpdateReservedBudgetRequest,
} from '../models/reserved-budget';

@Injectable({
  providedIn: 'root',
})
export class ReservedBudgetService {
  private readonly http = inject(HttpClient);
  private readonly reservedBudgetsUrl = `${environment.apiUrl}/reserved-budgets`;

  private readonly reservedBudgetsSubject = new BehaviorSubject<readonly ReservedBudget[]>([]);
  private readonly loadingCounter = new LoadingCounter();
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly updatingSubject = new BehaviorSubject<string | null>(null);
  private readonly linkingSubject = new BehaviorSubject<string | null>(null);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly migratingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadReservedBudgetsTrigger$ = new Subject<string>();
  // Month (YYYY-MM) of the last load; reused by internal reloads (e.g. after delete).
  private lastActiveAt = this.currentMonth();

  readonly reservedBudgets$ = this.reservedBudgetsSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
  readonly saving$ = this.savingSubject.asObservable();
  readonly updating$ = this.updatingSubject.asObservable();
  readonly linking$ = this.linkingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly migrating$ = this.migratingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadReservedBudgetsTrigger$
      .pipe(
        tap(() => {
          this.errorSubject.next(null);
          this.loadingCounter.start();
        }),
        // Use the active-at listing so consumed/remaining come populated for the target month.
        // Wallets can have more reserved budgets than a single page (the backend defaults to
        // 20 per page when size isn't sent) — walk every page and concatenate.
        switchMap((activeAt) =>
          fetchAllPages((page) => this.findActiveAt(activeAt, page, 100)).pipe(
            tap((reservedBudgets) => this.reservedBudgetsSubject.next(reservedBudgets)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar os reserved budgets.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
          ),
        ),
      )
      .subscribe();
  }

  findAll(page = 0, size = 100): Observable<PagedReservedBudgetResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<PagedReservedBudgetResponse>(this.reservedBudgetsUrl, { params });
  }

  findActiveAt(month: string, page = 0, size = 100): Observable<PagedReservedBudgetResponse> {
    const params = new HttpParams()
      .set('activeAt', month)
      .set('page', page)
      .set('size', size);

    return this.http.get<PagedReservedBudgetResponse>(this.reservedBudgetsUrl, { params });
  }

  findById(id: string): Observable<ReservedBudget> {
    return this.http.get<ReservedBudget>(`${this.reservedBudgetsUrl}/${id}`);
  }

  create(input: CreateReservedBudgetRequest): Observable<ReservedBudget> {
    const createdReservedBudgetSubject = new ReplaySubject<ReservedBudget>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<ReservedBudget>(this.reservedBudgetsUrl, input)
      .pipe(
        tap({
          next: (reservedBudget) => this.upsertReservedBudget(reservedBudget),
          error: () => this.errorSubject.next('Não foi possível criar o reserved budget.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (reservedBudget) => {
          createdReservedBudgetSubject.next(reservedBudget);
          createdReservedBudgetSubject.complete();
        },
        error: (error: unknown) => createdReservedBudgetSubject.error(error),
      });

    return createdReservedBudgetSubject.asObservable();
  }

  update(id: string, input: UpdateReservedBudgetRequest): Observable<ReservedBudget> {
    const updatedReservedBudgetSubject = new ReplaySubject<ReservedBudget>(1);

    this.updatingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .patch<ReservedBudget>(`${this.reservedBudgetsUrl}/${id}`, input)
      .pipe(
        tap({
          next: (reservedBudget) => this.upsertReservedBudget(reservedBudget),
          error: () => this.errorSubject.next('Não foi possível atualizar o reserved budget.'),
        }),
        finalize(() => this.updatingSubject.next(null)),
      )
      .subscribe({
        next: (reservedBudget) => {
          updatedReservedBudgetSubject.next(reservedBudget);
          updatedReservedBudgetSubject.complete();
        },
        error: (error: unknown) => updatedReservedBudgetSubject.error(error),
      });

    return updatedReservedBudgetSubject.asObservable();
  }

  link(id: string, input: LinkReservedBudgetSourceRequest): Observable<ReservedBudget> {
    const linkedReservedBudgetSubject = new ReplaySubject<ReservedBudget>(1);

    this.linkingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .post<ReservedBudget>(`${this.reservedBudgetsUrl}/${id}/links`, input)
      .pipe(
        tap({
          next: (reservedBudget) => this.upsertReservedBudget(reservedBudget),
          error: () => this.errorSubject.next('Não foi possível vincular a fonte.'),
        }),
        finalize(() => this.linkingSubject.next(null)),
      )
      .subscribe({
        next: (reservedBudget) => {
          linkedReservedBudgetSubject.next(reservedBudget);
          linkedReservedBudgetSubject.complete();
        },
        error: (error: unknown) => linkedReservedBudgetSubject.error(error),
      });

    return linkedReservedBudgetSubject.asObservable();
  }

  unlink(
    id: string,
    sourceType: ReservedBudgetLinkSourceType,
    sourceId: string,
  ): Observable<ReservedBudget> {
    const unlinkedReservedBudgetSubject = new ReplaySubject<ReservedBudget>(1);

    this.linkingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<ReservedBudget>(
        `${this.reservedBudgetsUrl}/${id}/links/${sourceType}/${sourceId}`,
      )
      .pipe(
        tap({
          next: (reservedBudget) => this.upsertReservedBudget(reservedBudget),
          error: () => this.errorSubject.next('Não foi possível desvincular a fonte.'),
        }),
        finalize(() => this.linkingSubject.next(null)),
      )
      .subscribe({
        next: (reservedBudget) => {
          unlinkedReservedBudgetSubject.next(reservedBudget);
          unlinkedReservedBudgetSubject.complete();
        },
        error: (error: unknown) => unlinkedReservedBudgetSubject.error(error),
      });

    return unlinkedReservedBudgetSubject.asObservable();
  }

  /**
   * Soft-deletes a reserved budget under one of the two modalities (RBM-F13). `mode` is
   * required, with no default — a silent default would make a forgotten call site end the
   * reserve when the user asked to skip a single month, or vice versa. `walletId` is required by
   * the backend too (confirmed in RBM-F1: `DELETE /reserved-budgets/{id}?mode=...&walletId=...`,
   * 400 without it) — always pass `selectedWallet()?.id` from the caller, never `now()`-derived
   * state.
   */
  delete(id: string, mode: ReservedBudgetDeleteMode, walletId: string): Observable<void> {
    const deletedReservedBudgetSubject = new ReplaySubject<void>(1);
    const params = new HttpParams().set('mode', mode).set('walletId', walletId);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    // No local-store mutation and no loadReservedBudgets() call here (unlike the pre-RBM-F13
    // version, which used to filter the deleted id out of reservedBudgetsSubject directly). That
    // was correct for a hard delete but wrong for SKIP_MONTH — the reserve must reappear next
    // month, so silently dropping it from the in-memory list forever is a bug, not an
    // optimization. The 200 body (full RB with updated endMonth/skippedMonths) is discarded for
    // the same reason createMigration/deleteMigration discard theirs — the caller reloads the
    // viewed month explicitly (P5, RBM-F13: reloadForViewedMonth() on the normal path,
    // reloadAfterMigration() on the chained-undo path).
    this.http
      .delete<void>(`${this.reservedBudgetsUrl}/${id}`, { params })
      .pipe(
        tap({
          error: () => this.errorSubject.next('Não foi possível remover o reserved budget.'),
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          deletedReservedBudgetSubject.next();
          deletedReservedBudgetSubject.complete();
        },
        error: (error: unknown) => deletedReservedBudgetSubject.error(error),
      });

    return deletedReservedBudgetSubject.asObservable();
  }

  /**
   * Creates a migration (moves money from this reserved budget into a bullet).
   * `POST /reserved-budgets/{id}/migrations` returns the full `ReservedBudgetResponseDto`
   * (201), but the return type here is deliberately `Observable<void>` — the body is
   * discarded on purpose, not an oversight. Same root cause as `reloadForViewedMonth()`
   * (`reserved-budget-page.ts`): the backend resolves the response against the *real-world*
   * current month, which may not be the month the wallet is currently viewing, so upserting
   * it would silently corrupt the on-screen figures. Migration is worse than link/unlink in
   * this respect because Bullet and ExtraBudget also change as a side effect and neither is
   * present in this response body at all — only a full reload (RBM-F6) can bring all three
   * stores back in sync. Do NOT add an `upsertReservedBudget()` call here.
   */
  createMigration(
    reservedBudgetId: string,
    input: CreateReservedBudgetMigrationRequest,
  ): Observable<void> {
    const migratedSubject = new ReplaySubject<void>(1);

    this.migratingSubject.next(reservedBudgetId);
    this.errorSubject.next(null);

    this.http
      .post<ReservedBudget>(`${this.reservedBudgetsUrl}/${reservedBudgetId}/migrations`, input)
      .pipe(
        map(() => undefined),
        tap({
          error: () => this.errorSubject.next('Não foi possível criar a migration.'),
        }),
        finalize(() => this.migratingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          migratedSubject.next();
          migratedSubject.complete();
        },
        error: (error: unknown) => migratedSubject.error(error),
      });

    return migratedSubject.asObservable();
  }

  /**
   * Undoes a migration. The 2nd argument is the `extraBudgetId` — the `ExtraBudget` created by
   * the migration is what materializes it, and there is no separate migration id.
   * `DELETE /reserved-budgets/{id}/migrations/{extraBudgetId}` also returns the full RB (200),
   * discarded for the same reason documented on `createMigration` above — do NOT upsert it.
   */
  deleteMigration(reservedBudgetId: string, extraBudgetId: string): Observable<void> {
    const undoneSubject = new ReplaySubject<void>(1);

    this.migratingSubject.next(reservedBudgetId);
    this.errorSubject.next(null);

    this.http
      .delete<ReservedBudget>(
        `${this.reservedBudgetsUrl}/${reservedBudgetId}/migrations/${extraBudgetId}`,
      )
      .pipe(
        map(() => undefined),
        tap({
          error: () => this.errorSubject.next('Não foi possível desfazer a migration.'),
        }),
        finalize(() => this.migratingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          undoneSubject.next();
          undoneSubject.complete();
        },
        error: (error: unknown) => undoneSubject.error(error),
      });

    return undoneSubject.asObservable();
  }

  /**
   * Loads reserved budgets active in the given month (defaults to the current month).
   * Pass the selected wallet's `effectiveMonth` so the list and its consumed/remaining
   * figures reflect the month the user is viewing, not the real-world current month.
   */
  loadReservedBudgets(activeAt: string = this.lastActiveAt): void {
    this.lastActiveAt = activeAt;
    this.loadReservedBudgetsTrigger$.next(activeAt);
  }

  private upsertReservedBudget(reservedBudget: ReservedBudget): void {
    const currentReservedBudgets = this.reservedBudgetsSubject.getValue();

    this.reservedBudgetsSubject.next([
      reservedBudget,
      ...currentReservedBudgets.filter(
        (currentReservedBudget) => currentReservedBudget.id !== reservedBudget.id,
      ),
    ]);
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
