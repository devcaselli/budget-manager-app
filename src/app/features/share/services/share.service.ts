import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import { CreateShareRequest, Share } from '../models/share';

const SHARE_STOP_CONFLICT_MESSAGE =
  'Este compartilhamento nao pode ser interrompido (e despesa ou ja foi revertido).';

@Injectable({
  providedIn: 'root',
})
export class ShareService {
  private readonly http = inject(HttpClient);
  private readonly sharesUrl = `${environment.apiUrl}/shares`;
  private readonly walletsUrl = `${environment.apiUrl}/wallets`;

  private readonly sharesSubject = new BehaviorSubject<readonly Share[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly revertingSubject = new BehaviorSubject<string | null>(null);
  private readonly stoppingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  private currentWalletId: string | null = null;

  readonly shares$ = this.sharesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly reverting$ = this.revertingSubject.asObservable();
  readonly stopping$ = this.stoppingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  /**
   * Loads the shares effective for the given wallet's month, including recurring
   * shares created in earlier wallets. Replaces the previous owner-global fetch +
   * client-side walletId filtering.
   */
  loadByWalletId(walletId: string | null): void {
    this.currentWalletId = walletId;

    if (!walletId) {
      this.sharesSubject.next([]);
      return;
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .get<Share[]>(`${this.walletsUrl}/${walletId}/shares`)
      .pipe(
        tap((shares) => this.sharesSubject.next(shares)),
        catchError(() => {
          this.errorSubject.next('Nao foi possivel carregar os compartilhamentos.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  create(request: CreateShareRequest): Observable<Share> {
    const subject = new ReplaySubject<Share>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Share>(this.sharesUrl, request)
      .pipe(
        tap({
          next: (created) => {
            const current = this.sharesSubject.getValue();
            this.sharesSubject.next([
              created,
              ...current.filter((share) => share.id !== created.id),
            ]);
          },
          error: () => this.errorSubject.next('Nao foi possivel criar o compartilhamento.'),
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

  revert(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.revertingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .post<void>(`${this.sharesUrl}/${id}/revert`, null)
      .pipe(
        tap({
          next: () => this.reloadCurrentWallet(),
          error: () => this.errorSubject.next('Nao foi possivel reverter o compartilhamento.'),
        }),
        finalize(() => this.revertingSubject.next(null)),
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

  /**
   * Stops a recurring share from the given wallet's month forward (non-destructive).
   * No payment reversal happens; past wallets keep the share.
   */
  stop(walletId: string, shareId: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.stoppingSubject.next(shareId);
    this.errorSubject.next(null);

    this.http
      .post<void>(`${this.walletsUrl}/${walletId}/shares/${shareId}/stop`, null)
      .pipe(
        tap({
          next: () => this.reloadCurrentWallet(),
          error: (error: unknown) => this.errorSubject.next(this.resolveStopError(error)),
        }),
        finalize(() => this.stoppingSubject.next(null)),
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

  private reloadCurrentWallet(): void {
    this.loadByWalletId(this.currentWalletId);
  }

  private resolveStopError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return SHARE_STOP_CONFLICT_MESSAGE;
    }
    return 'Nao foi possivel interromper o compartilhamento.';
  }
}
