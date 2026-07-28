import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  EMPTY,
  finalize,
  forkJoin,
  Observable,
  ReplaySubject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';
import { LoadingCounter } from '@core/state/loading-counter';

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
  private readonly allInstallmentsSubject = new BehaviorSubject<readonly Installment[]>([]);
  private readonly paginationSubject = new BehaviorSubject<Omit<PagedInstallmentResponse, 'content'>>({
    page: 0,
    size: 7,
    totalElements: 0,
    totalPages: 0,
  });
  private readonly creditCardsSubject = new BehaviorSubject<readonly CreditCard[]>([]);
  private readonly loadingCounter = new LoadingCounter();
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly walletIdSubject = new BehaviorSubject<string | null>(null);
  private readonly filterSubject = new BehaviorSubject<InstallmentFilter>(DEFAULT_FILTER);

  readonly installments$ = this.installmentsSubject.asObservable();
  readonly allInstallments$ = this.allInstallmentsSubject.asObservable();
  readonly pagination$ = this.paginationSubject.asObservable();
  readonly creditCards$ = this.creditCardsSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
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
            this.allInstallmentsSubject.next([]);
            return;
          }
          this.loadingCounter.start();
        }),
        switchMap(([walletId, filter]) => {
          if (!walletId) return EMPTY;
          return forkJoin({
            paged: this.fetchByWalletId(walletId, filter),
            all: this.fetchAllByWalletId(walletId, filter),
          }).pipe(
            tap(({ paged, all }) => {
              this.installmentsSubject.next(paged.content);
              this.allInstallmentsSubject.next(all);
              this.paginationSubject.next({
                page: paged.page,
                size: paged.size,
                totalElements: paged.totalElements,
                totalPages: paged.totalPages,
              });
            }),
            catchError(() => {
              this.errorSubject.next('Unable to load installments.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
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

  /**
   * On-demand fetch of finished (fully-paid) installments for a wallet.
   *
   * <p>Deliberately NOT wired into the reactive `combineLatest` pipeline — finished
   * installments are only needed when the "finished" modal is open, so callers
   * subscribe explicitly. Does not mutate `installments$` / `allInstallments$`.</p>
   */
  loadFinished(walletId: string, filter: InstallmentFilter): Observable<PagedInstallmentResponse> {
    let params = new HttpParams()
      .set('page', filter.page)
      .set('size', filter.size)
      .set('sort', filter.sort);

    if (filter.creditCardId) {
      params = params.set('creditCardId', filter.creditCardId);
    }

    return this.http.get<PagedInstallmentResponse>(
      `${this.installmentsUrl}/wallet/${walletId}/finished`,
      { params },
    );
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

  patch(
    id: string,
    request: PatchInstallmentRequest,
    errorMessage = 'Unable to update the installment.',
  ): Observable<Installment> {
    const subject = new ReplaySubject<Installment>(1);

    this.errorSubject.next(null);

    this.http
      .patch<Installment>(`${this.installmentsUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => {
            const currentPaged = this.installmentsSubject.getValue();
            this.installmentsSubject.next(currentPaged.map((i) => (i.id === id ? updated : i)));
            const currentAll = this.allInstallmentsSubject.getValue();
            this.allInstallmentsSubject.next(currentAll.map((i) => (i.id === id ? updated : i)));
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
   * Replaces the full tag set on an installment. Thin wrapper over `patch()` — the backend
   * has no dedicated tags endpoint, `tagIds` is just another field on `PATCH /installments/{id}`.
   *
   * Uses a tag-specific error message so a failure here (which happens after the installment
   * itself was already created/exists) doesn't read like the whole operation failed.
   */
  assignTags(id: string, tagIds: readonly string[]): Observable<Installment> {
    return this.patch(id, { tagIds }, 'Installment saved, but tags could not be applied. Try again from its row.');
  }

  exportByWalletId(
    walletId: string,
    filter: Pick<InstallmentFilter, 'creditCardId' | 'sort'>,
  ): Observable<Blob> {
    let params = new HttpParams().set('sort', filter.sort);
    if (filter.creditCardId) {
      params = params.set('creditCardId', filter.creditCardId);
    }

    return this.http.get(`${this.installmentsUrl}/wallet/${walletId}/export`, {
      params,
      responseType: 'blob',
    });
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

  private fetchAllByWalletId(walletId: string, filter: InstallmentFilter): Observable<readonly Installment[]> {
    let params = new HttpParams().set('sort', filter.sort);

    if (filter.creditCardId) {
      params = params.set('creditCardId', filter.creditCardId);
    }

    return this.http.get<readonly Installment[]>(`${this.installmentsUrl}/wallet/${walletId}/all`, { params });
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
}
