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
import { PreferencesService } from '@core/services/preferences.service';

import { CreateWalletRequest, Wallet } from '../models/wallet';
import { Payer } from '@features/payer/models/payer';

@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly preferences = inject(PreferencesService);
  private readonly walletsUrl = `${environment.apiUrl}/wallets`;

  private readonly walletsSubject = new BehaviorSubject<readonly Wallet[]>([]);
  private readonly selectedWalletSubject = new BehaviorSubject<Wallet | null>(null);
  private readonly loadingCounter = new LoadingCounter();
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadWalletsTrigger$ = new Subject<void>();
  private readonly selectWalletTrigger$ = new Subject<Wallet>();

  readonly wallets$ = this.walletsSubject.asObservable();
  readonly selectedWallet$ = this.selectedWalletSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
  readonly saving$ = this.savingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadWalletsTrigger$
      .pipe(
        tap(() => {
          this.loadingCounter.start();
          this.errorSubject.next(null);
        }),
        switchMap(() =>
          this.findAll().pipe(
            tap((wallets) => {
              this.walletsSubject.next(wallets);
              this.syncSelectedWallet(wallets);
            }),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar as wallets.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
          ),
        ),
      )
      .subscribe();

    this.selectWalletTrigger$
      .pipe(
        tap((wallet) => {
          this.selectedWalletSubject.next(wallet);
          this.loadingCounter.start();
          this.errorSubject.next(null);
        }),
        switchMap((wallet) =>
          this.findById(wallet.id).pipe(
            tap((details) => this.selectedWalletSubject.next(details)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar os detalhes da wallet.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
          ),
        ),
      )
      .subscribe();
  }

  findAll(): Observable<Wallet[]> {
    return this.http.get<Wallet[]>(this.walletsUrl);
  }

  findById(id: string): Observable<Wallet> {
    return this.http.get<Wallet>(`${this.walletsUrl}/${id}`);
  }

  findPayersByWalletId(walletId: string): Observable<Payer[]> {
    return this.http.get<Payer[]>(`${this.walletsUrl}/${walletId}/payers`);
  }

  create(input: CreateWalletRequest): Observable<Wallet> {
    const createdWalletSubject = new ReplaySubject<Wallet>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Wallet>(this.walletsUrl, input)
      .pipe(
        tap({
          next: (wallet) => {
            const currentWallets = this.walletsSubject.getValue();
            this.walletsSubject.next([
              wallet,
              ...currentWallets.filter((currentWallet) => currentWallet.id !== wallet.id),
            ]);
            this.selectedWalletSubject.next(wallet);
          },
          error: () => this.errorSubject.next('Não foi possível abrir a wallet.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (wallet) => {
          createdWalletSubject.next(wallet);
          createdWalletSubject.complete();
        },
        error: (error: unknown) => createdWalletSubject.error(error),
      });

    return createdWalletSubject.asObservable();
  }

  loadWallets(): void {
    this.loadWalletsTrigger$.next();
  }

  selectWallet(wallet: Wallet): void {
    if (this.selectedWalletSubject.getValue()?.id === wallet.id) {
      return;
    }

    this.selectWalletTrigger$.next(wallet);
  }

  private syncSelectedWallet(wallets: readonly Wallet[]): void {
    if (wallets.length === 0) {
      this.selectedWalletSubject.next(null);
      return;
    }

    // On every (re)load prefer the starred favorite, so a reload or manual refresh always
    // returns to it. Falls back to the current selection, then the first wallet.
    const favoriteId = this.preferences.favoriteWalletId();
    const favorite = favoriteId ? wallets.find((wallet) => wallet.id === favoriteId) : undefined;
    if (favorite) {
      this.selectedWalletSubject.next(favorite);
      return;
    }

    const selectedWallet = this.selectedWalletSubject.getValue();
    this.selectedWalletSubject.next(
      wallets.find((wallet) => wallet.id === selectedWallet?.id) ?? wallets[0],
    );
  }
}
