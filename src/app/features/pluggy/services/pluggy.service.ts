import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  map,
  Observable,
  ReplaySubject,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import {
  ConnectTokenResponse,
  MaterializeRequest,
  MaterializeResult,
  PluggyConnection,
  PluggyItemStatus,
  PluggyItemStatusResponse,
  PluggyTransactionPreview,
  TransactionRange,
} from '../models/pluggy';

@Injectable({ providedIn: 'root' })
export class PluggyService {
  private readonly http = inject(HttpClient);
  private readonly pluggyUrl = `${environment.apiUrl}/pluggy`;

  private readonly connectionsSubject = new BehaviorSubject<readonly PluggyConnection[]>([]);
  private readonly transactionsSubject = new BehaviorSubject<readonly PluggyTransactionPreview[]>(
    [],
  );
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly connections$ = this.connectionsSubject.asObservable();
  readonly transactions$ = this.transactionsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  /**
   * POST /pluggy/connect-token → connect token string for the Connect widget.
   *
   * With no `itemId` → new-connection token (sends an empty body, unchanged).
   * With an `itemId` → UPDATE-MODE token scoped to that existing item.
   */
  getConnectToken(itemId?: string): Observable<string> {
    const subject = new ReplaySubject<string>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    const body = itemId ? { itemId } : {};

    this.http
      .post<ConnectTokenResponse>(`${this.pluggyUrl}/connect-token`, body)
      .pipe(
        map((response) => response.connectToken),
        tap({
          error: () => this.errorSubject.next('Não foi possível iniciar a conexão com o banco.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (token) => {
          subject.next(token);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  /** POST /pluggy/items {itemId} — Connect widget callback registering the new item. */
  registerItem(itemId: string): Observable<PluggyConnection> {
    const subject = new ReplaySubject<PluggyConnection>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<PluggyConnection>(`${this.pluggyUrl}/items`, { itemId })
      .pipe(
        tap({
          next: (connection) => {
            const current = this.connectionsSubject.getValue();
            const withoutDupe = current.filter((c) => c.itemId !== connection.itemId);
            this.connectionsSubject.next([connection, ...withoutDupe]);
          },
          error: () => this.errorSubject.next('Não foi possível registrar a conexão.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (connection) => {
          subject.next(connection);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  /** GET /pluggy/connections → pushes to connections$. */
  loadConnections(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .get<readonly PluggyConnection[]>(`${this.pluggyUrl}/connections`)
      .pipe(
        tap((connections) => this.connectionsSubject.next(connections)),
        catchError(() => {
          this.errorSubject.next('Não foi possível carregar as conexões.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  /** GET /pluggy/items/{itemId}/transactions → pushes to transactions$. */
  loadTransactions(itemId: string, range: TransactionRange = {}): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    let params = new HttpParams();
    if (range.from) {
      params = params.set('from', range.from);
    }
    if (range.to) {
      params = params.set('to', range.to);
    }

    this.http
      .get<readonly PluggyTransactionPreview[]>(
        `${this.pluggyUrl}/items/${itemId}/transactions`,
        { params },
      )
      .pipe(
        tap((transactions) => this.transactionsSubject.next(transactions)),
        catchError(() => {
          this.errorSubject.next('Não foi possível carregar as transações.');
          this.transactionsSubject.next([]);
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  clearTransactions(): void {
    this.transactionsSubject.next([]);
  }

  /** GET /pluggy/items/{itemId}/status → current Pluggy item status (for polling). */
  getItemStatus(itemId: string): Observable<PluggyItemStatus> {
    return this.http
      .get<PluggyItemStatusResponse>(`${this.pluggyUrl}/items/${itemId}/status`)
      .pipe(map((response) => response.status));
  }

  /** POST /pluggy/items/{itemId}/materialize → MaterializeResult. */
  materialize(itemId: string, payload: MaterializeRequest): Observable<MaterializeResult> {
    const subject = new ReplaySubject<MaterializeResult>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<MaterializeResult>(`${this.pluggyUrl}/items/${itemId}/materialize`, payload)
      .pipe(
        tap({
          error: () => this.errorSubject.next('Não foi possível importar as transações.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (result) => {
          subject.next(result);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }
}
