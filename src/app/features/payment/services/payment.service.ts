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

import { PagedPaymentResponse, PayExpenseRequest, Payment } from '../models/payment';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly payUrl = `${environment.apiUrl}/pay`;
  private readonly paymentsUrl = `${environment.apiUrl}/payments`;

  private readonly paymentsSubject = new BehaviorSubject<readonly Payment[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly payingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadPaymentsTrigger$ = new Subject<string | null>();
  private activeLoadingRequests = 0;

  readonly payments$ = this.paymentsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly paying$ = this.payingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();
  readonly canDeletePayments = false;

  constructor() {
    this.loadPaymentsTrigger$
      .pipe(
        tap((walletId) => {
          this.errorSubject.next(null);

          if (!walletId) {
            this.paymentsSubject.next([]);
            return;
          }

          this.startLoading();
        }),
        switchMap((walletId) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId).pipe(
            tap((response) => this.paymentsSubject.next(response.content)),
            catchError(() => {
              this.errorSubject.next('Nao foi possivel carregar os pagamentos.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
          );
        }),
      )
      .subscribe();
  }

  findByWalletId(walletId: string, page = 0, size = 100): Observable<PagedPaymentResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<PagedPaymentResponse>(`${this.paymentsUrl}/wallet/${walletId}`, {
      params,
    });
  }

  payExpense(request: PayExpenseRequest): Observable<void> {
    const paidSubject = new ReplaySubject<void>(1);
    const params = new HttpParams().set('walletId', request.walletId);

    this.payingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<void>(this.payUrl, request.body, { params })
      .pipe(
        tap({
          error: () => this.errorSubject.next('Nao foi possivel registrar o pagamento.'),
        }),
        finalize(() => this.payingSubject.next(false)),
      )
      .subscribe({
        next: () => {
          paidSubject.next();
          paidSubject.complete();
        },
        error: (error: unknown) => paidSubject.error(error),
      });

    return paidSubject.asObservable();
  }

  loadByWalletId(walletId: string | null): void {
    this.loadPaymentsTrigger$.next(walletId);
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
