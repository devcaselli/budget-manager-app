import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';
import { LoadingCounter } from '@core/state/loading-counter';

import {
  ChartPeriod,
  CreateExpenseRequest,
  Expense,
  PagedExpenseResponse,
  PatchExpenseRequest,
} from '../models/expense';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly expensesUrl = `${environment.apiUrl}/expenses`;

  private readonly expensesSubject = new BehaviorSubject<readonly Expense[]>([]);
  private readonly allExpensesSubject = new BehaviorSubject<readonly Expense[]>([]);
  private readonly loadingCounter = new LoadingCounter();
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadExpensesTrigger$ = new Subject<{
    walletId: string | null;
    unhidden: boolean;
  }>();

  readonly expenses$ = this.expensesSubject.asObservable();
  readonly allExpenses$ = this.allExpensesSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadExpensesTrigger$
      .pipe(
        tap(({ walletId }) => {
          this.errorSubject.next(null);

          if (!walletId) {
            this.expensesSubject.next([]);
            return;
          }

          this.loadingCounter.start();
        }),
        // switchMap cancels the in-flight request on every new trigger, so rapid wallet
        // switches or `unhidden` toggles can never let a stale response win the race.
        switchMap(({ walletId, unhidden }) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId, 0, 100, unhidden).pipe(
            tap((response) => this.expensesSubject.next(response.content)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar as expenses.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
          );
        }),
      )
      .subscribe();
  }

  findByWalletId(
    walletId: string,
    page = 0,
    size = 100,
    unhidden = false,
  ): Observable<PagedExpenseResponse> {
    let params = new HttpParams()
      .set('page', page)
      .set('size', size);

    // Backend defaults to `unhidden=false`; only send it when it deviates so existing
    // call-sites keep producing the exact same request they always have.
    if (unhidden) {
      params = params.set('unhidden', unhidden);
    }

    return this.http.get<PagedExpenseResponse>(`${this.expensesUrl}/wallet/${walletId}`, {
      params,
    });
  }

  findMine(months: ChartPeriod = '12'): Observable<readonly Expense[]> {
    const params = new HttpParams().set('months', months);
    return this.http.get<Expense[]>(`${this.expensesUrl}/mine`, { params });
  }

  exportMine(): Observable<Blob> {
    return this.http.get(`${this.expensesUrl}/mine/export`, {
      responseType: 'blob',
    });
  }

  loadMine(months: ChartPeriod = '12'): void {
    this.findMine(months).pipe(
      tap((expenses) => this.allExpensesSubject.next(expenses)),
      catchError(() => EMPTY),
    ).subscribe();
  }

  create(input: CreateExpenseRequest): Observable<Expense> {
    const createdExpenseSubject = new ReplaySubject<Expense>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Expense>(this.expensesUrl, input)
      .pipe(
        tap({
          next: (expense) => {
            const currentExpenses = this.expensesSubject.getValue();
            this.expensesSubject.next([
              expense,
              ...currentExpenses.filter((currentExpense) => currentExpense.id !== expense.id),
            ]);
          },
          error: () => this.errorSubject.next('Não foi possível criar a expense.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (expense) => {
          createdExpenseSubject.next(expense);
          createdExpenseSubject.complete();
        },
        error: (error: unknown) => createdExpenseSubject.error(error),
      });

    return createdExpenseSubject.asObservable();
  }

  delete(id: string): Observable<void> {
    const deletedExpenseSubject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.expensesUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const currentExpenses = this.expensesSubject.getValue();
            this.expensesSubject.next(currentExpenses.filter((expense) => expense.id !== id));
          },
          error: () => this.errorSubject.next('Não foi possível remover a expense.'),
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          deletedExpenseSubject.next();
          deletedExpenseSubject.complete();
        },
        error: (error: unknown) => deletedExpenseSubject.error(error),
      });

    return deletedExpenseSubject.asObservable();
  }

  loadByWalletId(walletId: string | null, unhidden = false): void {
    this.loadExpensesTrigger$.next({ walletId, unhidden });
  }

  patch(
    id: string,
    request: PatchExpenseRequest,
    errorMessage = 'Não foi possível atualizar a expense.',
  ): Observable<Expense> {
    const subject = new ReplaySubject<Expense>(1);

    this.errorSubject.next(null);

    this.http
      .patch<Expense>(`${this.expensesUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => {
            const currentExpenses = this.expensesSubject.getValue();
            this.expensesSubject.next(
              currentExpenses.map((expense) => (expense.id === id ? updated : expense)),
            );
          },
          error: () => this.errorSubject.next(errorMessage),
        }),
      )
      .subscribe({
        next: (updated) => {
          subject.next(updated);
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  /**
   * Replaces the full tag set on an expense. Thin wrapper over `patch()` — the backend
   * has no dedicated tags endpoint, `tagIds` is just another field on `PATCH /expenses/{id}`.
   *
   * Uses a tag-specific error message so a failure here (which happens after the expense
   * itself was already created/exists) doesn't read like the whole operation failed.
   */
  assignTags(id: string, tagIds: readonly string[]): Observable<Expense> {
    return this.patch(id, { tagIds }, 'Expense salva, mas as tags não puderam ser aplicadas. Tente novamente na linha dela.');
  }
}
