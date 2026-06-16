import { HttpClient } from '@angular/common/http';
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

import { CreateExtraBudgetRequest, ExtraBudget } from '../models/extra-budget';

@Injectable({
  providedIn: 'root',
})
export class ExtraBudgetService {
  private readonly http = inject(HttpClient);
  private readonly extraBudgetsUrl = `${environment.apiUrl}/extra-budgets`;

  private readonly extraBudgetsSubject = new BehaviorSubject<readonly ExtraBudget[]>([]);
  private readonly loadingCounter = new LoadingCounter();
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadExtraBudgetsTrigger$ = new Subject<string | null>();

  readonly extraBudgets$ = this.extraBudgetsSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadExtraBudgetsTrigger$
      .pipe(
        tap((walletId) => {
          this.errorSubject.next(null);

          if (!walletId) {
            this.extraBudgetsSubject.next([]);
            return;
          }

          this.loadingCounter.start();
        }),
        switchMap((walletId) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId).pipe(
            tap((extraBudgets) => this.extraBudgetsSubject.next(extraBudgets)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar os extra budgets.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
          );
        }),
      )
      .subscribe();
  }

  findById(id: string): Observable<ExtraBudget> {
    return this.http.get<ExtraBudget>(`${this.extraBudgetsUrl}/${id}`);
  }

  findByWalletId(walletId: string): Observable<ExtraBudget[]> {
    return this.http.get<ExtraBudget[]>(`${this.extraBudgetsUrl}/wallet/${walletId}`);
  }

  findByBulletId(bulletId: string): Observable<ExtraBudget[]> {
    return this.http.get<ExtraBudget[]>(`${this.extraBudgetsUrl}/bullet/${bulletId}`);
  }

  create(input: CreateExtraBudgetRequest): Observable<ExtraBudget> {
    const createdExtraBudgetSubject = new ReplaySubject<ExtraBudget>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<ExtraBudget>(this.extraBudgetsUrl, input)
      .pipe(
        tap({
          next: (extraBudget) => {
            const current = this.extraBudgetsSubject.getValue();
            this.extraBudgetsSubject.next([
              extraBudget,
              ...current.filter((candidate) => candidate.id !== extraBudget.id),
            ]);
          },
          error: () => this.errorSubject.next('Não foi possível criar o extra budget.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (extraBudget) => {
          createdExtraBudgetSubject.next(extraBudget);
          createdExtraBudgetSubject.complete();
        },
        error: (error: unknown) => createdExtraBudgetSubject.error(error),
      });

    return createdExtraBudgetSubject.asObservable();
  }

  delete(id: string): Observable<void> {
    const deletedExtraBudgetSubject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.extraBudgetsUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const current = this.extraBudgetsSubject.getValue();
            this.extraBudgetsSubject.next(current.filter((extraBudget) => extraBudget.id !== id));
          },
          error: () => this.errorSubject.next('Não foi possível reverter o extra budget.'),
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          deletedExtraBudgetSubject.next();
          deletedExtraBudgetSubject.complete();
        },
        error: (error: unknown) => deletedExtraBudgetSubject.error(error),
      });

    return deletedExtraBudgetSubject.asObservable();
  }

  loadByWalletId(walletId: string | null): void {
    this.loadExtraBudgetsTrigger$.next(walletId);
  }
}
