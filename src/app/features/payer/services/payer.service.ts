import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  of,
  ReplaySubject,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';
import { CreatePayerRequest, Payer, PatchPayerRequest } from '../models/payer';

@Injectable({ providedIn: 'root' })
export class PayerService {
  private readonly http = inject(HttpClient);
  private readonly payersUrl = `${environment.apiUrl}/payers`;
  private readonly walletsUrl = `${environment.apiUrl}/wallets`;

  private readonly payersSubject = new BehaviorSubject<readonly Payer[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadByWalletIdTrigger$ = new Subject<string | null>();

  readonly payers$ = this.payersSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    /**
     * Bug fix (2026-09-05, Victor's report — "Total Due ainda está aparecendo
     * o último total due e não baseando-se no mês"): `loadByWalletId` used to
     * fire an independent `.subscribe()` per call with no cancellation of the
     * previous in-flight request. Switching wallets (= switching "month" in
     * this app) fast enough that the OLD wallet's GET resolves AFTER the NEW
     * wallet's GET let the stale response win the race and silently overwrite
     * `payersSubject` with the previous month's `amountDue` values — the
     * header (and list) would show "the last" total instead of the one for
     * the currently selected wallet. `switchMap` cancels the previous
     * request's subscription the instant a new `walletId` comes in, so only
     * the most-recently-requested wallet's response can ever land, same
     * pattern `WalletService.selectWalletTrigger$` already uses for exactly
     * this reason.
     */
    this.loadByWalletIdTrigger$
      .pipe(
        tap(() => {
          this.loadingSubject.next(true);
          this.errorSubject.next(null);
        }),
        switchMap((walletId) => {
          if (!walletId) {
            this.payersSubject.next([]);
            this.loadingSubject.next(false);
            return EMPTY;
          }
          return this.http.get<Payer[]>(`${this.walletsUrl}/${walletId}/payers`).pipe(
            tap((payers) => this.payersSubject.next(payers)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar os payers.');
              return of(null);
            }),
            finalize(() => this.loadingSubject.next(false)),
          );
        }),
      )
      .subscribe();
  }

  loadByWalletId(walletId: string | null): void {
    this.loadByWalletIdTrigger$.next(walletId);
  }

  save(request: CreatePayerRequest): Observable<Payer> {
    const subject = new ReplaySubject<Payer>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Payer>(this.payersUrl, request)
      .pipe(
        tap({
          next: (created) => {
            const current = this.payersSubject.getValue();
            this.payersSubject.next([...current, created]);
          },
          error: () => this.errorSubject.next('Não foi possível criar o payer.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (created) => {
          subject.next(created);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  patch(id: string, request: PatchPayerRequest): Observable<Payer> {
    const subject = new ReplaySubject<Payer>(1);

    this.errorSubject.next(null);

    this.http
      .patch<Payer>(`${this.payersUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => {
            const current = this.payersSubject.getValue();
            this.payersSubject.next(current.map((p) => (p.id === id ? updated : p)));
          },
          error: () => this.errorSubject.next('Não foi possível atualizar o payer.'),
        }),
      )
      .subscribe({
        next: (updated) => {
          subject.next(updated);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  delete(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.payersUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const current = this.payersSubject.getValue();
            this.payersSubject.next(current.filter((p) => p.id !== id));
          },
          error: () => this.errorSubject.next('Não foi possível remover o payer.'),
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          subject.next();
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }
}
