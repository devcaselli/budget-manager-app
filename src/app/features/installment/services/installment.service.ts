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

import { CreditCard, Installment, PagedCreditCardResponse } from '../models/installment';

@Injectable({
  providedIn: 'root',
})
export class InstallmentService {
  private readonly http = inject(HttpClient);
  private readonly installmentsUrl = `${environment.apiUrl}/installments`;
  private readonly creditCardsUrl = `${environment.apiUrl}/credit-cards`;

  private readonly installmentsSubject = new BehaviorSubject<readonly Installment[]>([]);
  private readonly creditCardsSubject = new BehaviorSubject<readonly CreditCard[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadTrigger$ = new Subject<string | null>();
  private activeLoadingRequests = 0;

  readonly installments$ = this.installmentsSubject.asObservable();
  readonly creditCards$ = this.creditCardsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadTrigger$
      .pipe(
        tap((walletId) => {
          this.errorSubject.next(null);
          if (!walletId) {
            this.installmentsSubject.next([]);
            return;
          }
          this.startLoading();
        }),
        switchMap((walletId) => {
          if (!walletId) return EMPTY;
          return this.findByWalletId(walletId).pipe(
            tap((installments) => this.installmentsSubject.next(installments)),
            catchError(() => {
              this.errorSubject.next('Nao foi possivel carregar os parcelamentos.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
          );
        }),
      )
      .subscribe();
  }

  loadByWalletId(walletId: string | null): void {
    this.loadTrigger$.next(walletId);
    if (walletId) this.loadCreditCards();
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
            const current = this.installmentsSubject.getValue();
            this.installmentsSubject.next(current.filter((i) => i.id !== id));
          },
          error: () => this.errorSubject.next('Nao foi possivel remover o parcelamento.'),
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

  private findByWalletId(walletId: string): Observable<readonly Installment[]> {
    return this.http.get<readonly Installment[]>(`${this.installmentsUrl}/wallet/${walletId}`);
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

  private startLoading(): void {
    this.activeLoadingRequests += 1;
    this.loadingSubject.next(true);
  }

  private stopLoading(): void {
    this.activeLoadingRequests = Math.max(this.activeLoadingRequests - 1, 0);
    this.loadingSubject.next(this.activeLoadingRequests > 0);
  }
}
