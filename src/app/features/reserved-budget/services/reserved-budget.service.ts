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

import {
  CreateReservedBudgetRequest,
  PagedReservedBudgetResponse,
  ReservedBudget,
  UpdateReservedBudgetRequest,
} from '../models/reserved-budget';

@Injectable({
  providedIn: 'root',
})
export class ReservedBudgetService {
  private readonly http = inject(HttpClient);
  private readonly reservedBudgetsUrl = `${environment.apiUrl}/reserved-budgets`;

  private readonly reservedBudgetsSubject = new BehaviorSubject<readonly ReservedBudget[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly updatingSubject = new BehaviorSubject<string | null>(null);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadReservedBudgetsTrigger$ = new Subject<void>();
  private activeLoadingRequests = 0;

  readonly reservedBudgets$ = this.reservedBudgetsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly updating$ = this.updatingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadReservedBudgetsTrigger$
      .pipe(
        tap(() => {
          this.errorSubject.next(null);
          this.startLoading();
        }),
        switchMap(() =>
          this.findAll().pipe(
            tap((response) => this.reservedBudgetsSubject.next(response.content)),
            catchError(() => {
              this.errorSubject.next('Nao foi possivel carregar os reserved budgets.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
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

  findActiveAt(month: string): Observable<PagedReservedBudgetResponse> {
    const params = new HttpParams().set('activeAt', month);

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
          error: () => this.errorSubject.next('Nao foi possivel criar o reserved budget.'),
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
          error: () => this.errorSubject.next('Nao foi possivel atualizar o reserved budget.'),
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

  delete(id: string): Observable<void> {
    const deletedReservedBudgetSubject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.reservedBudgetsUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const currentReservedBudgets = this.reservedBudgetsSubject.getValue();
            this.reservedBudgetsSubject.next(
              currentReservedBudgets.filter((reservedBudget) => reservedBudget.id !== id),
            );
            this.loadReservedBudgets();
          },
          error: () => this.errorSubject.next('Nao foi possivel remover o reserved budget.'),
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

  loadReservedBudgets(): void {
    this.loadReservedBudgetsTrigger$.next();
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

  private startLoading(): void {
    this.activeLoadingRequests += 1;
    this.loadingSubject.next(true);
  }

  private stopLoading(): void {
    this.activeLoadingRequests = Math.max(this.activeLoadingRequests - 1, 0);
    this.loadingSubject.next(this.activeLoadingRequests > 0);
  }
}
