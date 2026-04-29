import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, defer, EMPTY, finalize, Observable, tap } from 'rxjs';

import { environment } from '@environments/environment';

import { CreateWalletRequest, Wallet } from '../models/wallet';

@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly walletsUrl = `${environment.apiUrl}/wallets`;

  private readonly walletsSubject = new BehaviorSubject<readonly Wallet[]>([]);
  private readonly selectedWalletSubject = new BehaviorSubject<Wallet | null>(null);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private activeLoadingRequests = 0;

  readonly wallets$ = this.walletsSubject.asObservable();
  readonly selectedWallet$ = this.selectedWalletSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  findAll(): Observable<Wallet[]> {
    return this.http.get<Wallet[]>(this.walletsUrl);
  }

  findById(id: string): Observable<Wallet> {
    return this.http.get<Wallet>(`${this.walletsUrl}/${id}`);
  }

  create(input: CreateWalletRequest): Observable<Wallet> {
    return defer(() => {
      this.savingSubject.next(true);
      this.errorSubject.next(null);

      return this.http.post<Wallet>(this.walletsUrl, input).pipe(
        tap({
          next: (wallet) => {
            const currentWallets = this.walletsSubject.getValue();
            this.walletsSubject.next([
              wallet,
              ...currentWallets.filter((currentWallet) => currentWallet.id !== wallet.id),
            ]);
            this.selectedWalletSubject.next(wallet);
          },
          error: () => this.errorSubject.next('Nao foi possivel abrir a wallet.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      );
    });
  }

  loadWallets(): void {
    this.startLoading();
    this.errorSubject.next(null);

    this.findAll()
      .pipe(
        tap((wallets) => {
          this.walletsSubject.next(wallets);
          this.syncSelectedWallet(wallets);
        }),
        catchError(() => {
          this.errorSubject.next('Nao foi possivel carregar as wallets.');
          return EMPTY;
        }),
        finalize(() => this.stopLoading()),
      )
      .subscribe();
  }

  selectWallet(wallet: Wallet): void {
    if (this.selectedWalletSubject.getValue()?.id === wallet.id) {
      return;
    }

    this.selectedWalletSubject.next(wallet);
    this.startLoading();
    this.errorSubject.next(null);

    this.findById(wallet.id)
      .pipe(
        tap((details) => this.selectedWalletSubject.next(details)),
        catchError(() => {
          this.errorSubject.next('Nao foi possivel carregar os detalhes da wallet.');
          return EMPTY;
        }),
        finalize(() => this.stopLoading()),
      )
      .subscribe();
  }

  private syncSelectedWallet(wallets: readonly Wallet[]): void {
    const selectedWallet = this.selectedWalletSubject.getValue();

    if (wallets.length === 0) {
      this.selectedWalletSubject.next(null);
      return;
    }

    if (!selectedWallet) {
      this.selectedWalletSubject.next(wallets[0]);
      return;
    }

    this.selectedWalletSubject.next(
      wallets.find((wallet) => wallet.id === selectedWallet.id) ?? wallets[0],
    );
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
