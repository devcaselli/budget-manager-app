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

import { CreateExpenseRequest, Expense, PagedExpenseResponse } from '../models/expense';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly expensesUrl = `${environment.apiUrl}/expenses`;

  private readonly expensesSubject = new BehaviorSubject<readonly Expense[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadExpensesTrigger$ = new Subject<string | null>();
  private activeLoadingRequests = 0;

  readonly expenses$ = this.expensesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadExpensesTrigger$
      .pipe(
        tap((walletId) => {
          this.errorSubject.next(null);

          if (!walletId) {
            this.expensesSubject.next([]);
            return;
          }

          this.startLoading();
        }),
        switchMap((walletId) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId).pipe(
            tap((response) => this.expensesSubject.next(response.content)),
            catchError(() => {
              this.errorSubject.next('Nao foi possivel carregar as expenses.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
          );
        }),
      )
      .subscribe();
  }

  findByWalletId(walletId: string, page = 0, size = 100): Observable<PagedExpenseResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<PagedExpenseResponse>(`${this.expensesUrl}/wallet/${walletId}`, {
      params,
    });
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
          error: () => this.errorSubject.next('Nao foi possivel criar a expense.'),
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
          error: () => this.errorSubject.next('Nao foi possivel remover a expense.'),
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

  loadByWalletId(walletId: string | null): void {
    this.loadExpensesTrigger$.next(walletId);
  }

  private startLoading(): void {
    this.activeLoadingRequests += 1;
    this.loadingSubject.next(true);
  }

  private stopLoading(): void {
    this.activeLoadingRequests = Math.max(this.activeLoadingRequests - 1, 0);
    this.loadingSubject.next(this.activeLoadingRequests > 0);
  }
}
