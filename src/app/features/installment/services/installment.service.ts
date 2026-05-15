import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
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
  CreditCard,
  Installment,
  InstallmentSortOrder,
  PagedCreditCardResponse,
  PagedInstallmentResponse,
  PatchInstallmentRequest,
  SaveInstallmentRequest,
} from '../models/installment';

export interface InstallmentFilter {
  readonly creditCardId: string | null;
  readonly sort: InstallmentSortOrder;
  readonly page: number;
  readonly size: number;
}

const DEFAULT_FILTER: InstallmentFilter = {
  creditCardId: null,
  sort: 'ENDING_SOON',
  page: 0,
  size: 7,
};

@Injectable({
  providedIn: 'root',
})
export class InstallmentService {
  private readonly http = inject(HttpClient);
  private readonly installmentsUrl = `${environment.apiUrl}/installments`;
  private readonly creditCardsUrl = `${environment.apiUrl}/credit-cards`;

  private readonly installmentsSubject = new BehaviorSubject<readonly Installment[]>([]);
  private readonly paginationSubject = new BehaviorSubject<Omit<PagedInstallmentResponse, 'content'>>({
    page: 0,
    size: 7,
    totalElements: 0,
    totalPages: 0,
  });
  private readonly creditCardsSubject = new BehaviorSubject<readonly CreditCard[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly walletIdSubject = new BehaviorSubject<string | null>(null);
  private readonly filterSubject = new BehaviorSubject<InstallmentFilter>(DEFAULT_FILTER);
  private activeLoadingRequests = 0;

  readonly installments$ = this.installmentsSubject.asObservable();
  readonly pagination$ = this.paginationSubject.asObservable();
  readonly creditCards$ = this.creditCardsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();
  readonly filter$ = this.filterSubject.asObservable();

  constructor() {
    combineLatest([this.walletIdSubject, this.filterSubject])
      .pipe(
        tap(([walletId]) => {
          this.errorSubject.next(null);
          if (!walletId) {
            this.installmentsSubject.next([]);
            return;
          }
          this.startLoading();
        }),
        switchMap(([walletId, filter]) => {
          if (!walletId) return EMPTY;
          return this.fetchByWalletId(walletId, filter).pipe(
            tap((response) => {
              this.installmentsSubject.next(response.content);
              this.paginationSubject.next({
                page: response.page,
                size: response.size,
                totalElements: response.totalElements,
                totalPages: response.totalPages,
              });
            }),
            catchError(() => {
              this.errorSubject.next('Unable to load installments.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
          );
        }),
      )
      .subscribe();
  }

  loadByWalletId(walletId: string | null): void {
    const changed = this.walletIdSubject.getValue() !== walletId;
    this.walletIdSubject.next(walletId);
    if (walletId) {
      this.loadCreditCards();
      // Reset to page 0 on wallet switch
      if (changed) this.filterSubject.next({ ...this.filterSubject.getValue(), page: 0 });
    }
  }

  setFilter(partial: Partial<InstallmentFilter>): void {
    const current = this.filterSubject.getValue();
    // Any filter change resets to page 0 unless page itself is being set
    const page = partial.page ?? 0;
    this.filterSubject.next({ ...current, ...partial, page });
  }

  save(request: SaveInstallmentRequest): Observable<Installment> {
    const subject = new ReplaySubject<Installment>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Installment>(this.installmentsUrl, request)
      .pipe(
        tap({
          next: () => {
            // Reload current page to reflect server-side sort/filter
            this.walletIdSubject.next(this.walletIdSubject.getValue());
          },
          error: () => this.errorSubject.next('Unable to save the installment.'),
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

  patch(id: string, request: PatchInstallmentRequest): Observable<Installment> {
    const subject = new ReplaySubject<Installment>(1);

    this.errorSubject.next(null);

    this.http
      .patch<Installment>(`${this.installmentsUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => {
            const current = this.installmentsSubject.getValue();
            this.installmentsSubject.next(current.map((i) => (i.id === id ? updated : i)));
          },
          error: () => this.errorSubject.next('Unable to update the installment.'),
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

  delete(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.installmentsUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            // Reload to get correct pagination after delete
            this.walletIdSubject.next(this.walletIdSubject.getValue());
          },
          error: (error) => this.errorSubject.next(this.resolveDeleteErrorMessage(error)),
        }),
        finalize(() => this.deletingSubject.next(null)),
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

  private fetchByWalletId(walletId: string, filter: InstallmentFilter): Observable<PagedInstallmentResponse> {
    let params = new HttpParams()
      .set('page', filter.page)
      .set('size', filter.size)
      .set('sort', filter.sort);

    if (filter.creditCardId) {
      params = params.set('creditCardId', filter.creditCardId);
    }

    return this.http.get<PagedInstallmentResponse>(`${this.installmentsUrl}/wallet/${walletId}`, { params });
  }

  private loadCreditCards(): void {
    const params = new HttpParams().set('page', 0).set('size', 100);
    this.http
      .get<PagedCreditCardResponse>(this.creditCardsUrl, { params })
      .pipe(
        tap((response) => this.creditCardsSubject.next(response.content)),
        catchError(() => EMPTY),
      )
      .subscribe();
  }

  private resolveDeleteErrorMessage(error: unknown): string {
    const detail =
      typeof error === 'object' && error !== null
        ? (error as { error?: { detail?: unknown } }).error?.detail
        : null;

    if (
      typeof detail === 'string'
      && detail.includes('is referenced by an active share; revert the share before deleting')
    ) {
      return 'This installment is referenced by an active share. Revert the share before deleting it.';
    }

    return 'Unable to delete the installment.';
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
