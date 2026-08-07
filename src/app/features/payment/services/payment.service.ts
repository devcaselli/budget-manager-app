import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
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

import { PagedPaymentResponse, PayExpenseRequest, Payment } from '../models/payment';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly payUrl = `${environment.apiUrl}/pay`;
  private readonly paymentsUrl = `${environment.apiUrl}/payments`;

  private readonly paymentsSubject = new BehaviorSubject<readonly Payment[]>([]);
  private readonly loadingCounter = new LoadingCounter();
  private readonly payingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadPaymentsTrigger$ = new Subject<string | null>();
  /** F-10: id of the payment currently being reverted, `null` when no revert is in flight —
   * same per-row-loading shape as `ShareService.revertingSubject`, so a caller can disable/
   * spinner exactly one row instead of the whole list. */
  private readonly revertingSubject = new BehaviorSubject<string | null>(null);

  readonly payments$ = this.paymentsSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
  readonly paying$ = this.payingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();
  readonly reverting$ = this.revertingSubject.asObservable();
  readonly canDeletePayments = false;
  /** Mirrors `canDeletePayments` — no existing feature-flag/permission gate for payment
   * reversal in this project, so this stays a static `true`, exactly as `canDeletePayments`
   * is a static `false`: both are read-only doc-as-code markers for callers, not backed by
   * any runtime config today. */
  readonly canRevertPayments = true;

  constructor() {
    this.loadPaymentsTrigger$
      .pipe(
        tap((walletId) => {
          this.errorSubject.next(null);

          if (!walletId) {
            this.paymentsSubject.next([]);
            return;
          }

          this.loadingCounter.start();
        }),
        switchMap((walletId) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId).pipe(
            tap((response) => this.paymentsSubject.next(response.content)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar os pagamentos.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
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
          error: () => this.errorSubject.next('Não foi possível registrar o pagamento.'),
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

  /**
   * Reverts a payment via `POST /payments/{id}/revert` (backend B5/B6, `RevertPaymentUseCase`,
   * already merged in `budget-manager-api-public`). Mirrors `ShareService.revert()`'s shape
   * (`revertingSubject` for per-row loading, `errorSubject` for a user-facing message, `null`
   * body) with one difference: the backend responds `201` with the reversal `Payment` itself
   * (not `void`) — `Location` header points at the new payment's `GET /payments/{id}`, which
   * this method doesn't need to follow since the body already has everything.
   *
   * Unlike `ShareService.revert()`, this does NOT reload any local list on success — the
   * Omega Viewer (F-10's only caller today) re-fetches the current item's own detail via
   * `OmegaViewerService.load()` instead, which already includes the fresh payment trace. A
   * `PaymentPage`/list-reload story doesn't exist yet for this action.
   */
  revert(id: string): Observable<Payment> {
    const subject = new ReplaySubject<Payment>(1);

    this.revertingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .post<Payment>(`${this.paymentsUrl}/${id}/revert`, null)
      .pipe(
        tap({
          error: (error: unknown) => this.errorSubject.next(this.describeRevertError(error)),
        }),
        finalize(() => this.revertingSubject.next(null)),
      )
      .subscribe({
        next: (reverted) => {
          subject.next(reverted);
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  /**
   * Maps the backend's 422 `ProblemDetail` (`{ reason, paymentId }`) to a message the user can
   * act on. All 4 `reason` values are routine, expected business rejections in this domain —
   * not edge cases — so each gets its own specific message instead of one generic fallback
   * (code review C2 in this same feature already flagged a silent/generic-only error as
   * critical once; not repeating that here).
   *
   * Public (not `private`): `revert()` itself only ever surfaces this via `errorSubject`
   * (a `providedIn: 'root'` stream this shell's callers deliberately don't bind view-local UI
   * state to — see `OmegaViewerComponent.revertingId`'s doc comment), so
   * `OmegaViewerComponent.revertPayment()` calls this directly from its own `error` handler
   * instead of duplicating the same 4-reason mapping a second time.
   */
  describeRevertError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      const reason = (error.error as { reason?: string } | null)?.reason;
      switch (reason) {
        case 'SHARED_PAYMENT':
          return 'Pagamentos compartilhados são revertidos pela tela de Share.';
        case 'ALREADY_A_REVERSAL':
          return 'Este pagamento já é uma reversão e não pode ser revertido novamente.';
        case 'ALREADY_REVERTED':
          return 'Este pagamento já foi revertido anteriormente.';
        case 'NO_BULLET':
          return 'Este pagamento não está vinculado a um bullet e não pode ser revertido.';
      }
    }
    return 'Não foi possível reverter o pagamento.';
  }
}
