import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, finalize, Observable, ReplaySubject, tap } from 'rxjs';

import { environment } from '@environments/environment';

import { PayExpenseRequest } from '../models/payment';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly payUrl = `${environment.apiUrl}/pay`;

  private readonly payingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly paying$ = this.payingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

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
}
