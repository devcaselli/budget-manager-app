import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  MaterializeResult,
  PluggyConnection,
  PluggyTransactionPreview,
} from '../models/pluggy';
import { PluggyService } from './pluggy.service';

function buildConnection(overrides: Partial<PluggyConnection> = {}): PluggyConnection {
  return {
    id: 'conn-1',
    itemId: 'item-1',
    connectorId: 2,
    status: 'UPDATED',
    accountIds: ['acc-1'],
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function buildTransaction(
  overrides: Partial<PluggyTransactionPreview> = {},
): PluggyTransactionPreview {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    description: 'Supermercado',
    amount: 120.5,
    currency: 'BRL',
    date: '2026-06-10',
    alreadyImported: false,
    isExpense: true,
    ...overrides,
  };
}

describe('PluggyService', () => {
  let service: PluggyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PluggyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('should emit empty initial state for connections$ and transactions$', () => {
    let connections: readonly PluggyConnection[] | undefined;
    let transactions: readonly PluggyTransactionPreview[] | undefined;

    service.connections$.subscribe((value) => (connections = value));
    service.transactions$.subscribe((value) => (transactions = value));

    expect(connections).toEqual([]);
    expect(transactions).toEqual([]);
  });

  it('should return a new-connection token with NO itemId body via POST /api/pluggy/connect-token', () => {
    let token: string | undefined;

    service.getConnectToken().subscribe((value) => (token = value));

    const request = httpMock.expectOne('/api/pluggy/connect-token');
    expect(request.request.method).toBe('POST');
    // Regression guard: the new-connection call must NOT send an itemId.
    expect(request.request.body).toEqual({});
    request.flush({ connectToken: 'ct-abc' });

    expect(token).toBe('ct-abc');
  });

  it('should request an UPDATE-MODE token with { itemId } when getConnectToken(itemId) is called', () => {
    let token: string | undefined;

    service.getConnectToken('item-42').subscribe((value) => (token = value));

    const request = httpMock.expectOne('/api/pluggy/connect-token');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ itemId: 'item-42' });
    request.flush({ connectToken: 'ct-update' });

    expect(token).toBe('ct-update');
  });

  it('should get the item status via GET /api/pluggy/items/:itemId/status', () => {
    let status: string | undefined;

    service.getItemStatus('item-7').subscribe((value) => (status = value));

    const request = httpMock.expectOne('/api/pluggy/items/item-7/status');
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'UPDATED' });

    expect(status).toBe('UPDATED');
  });

  it('should set error$ when getConnectToken fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((value) => errors.push(value));

    service.getConnectToken().subscribe({ next: () => undefined, error: () => undefined });

    const request = httpMock.expectOne('/api/pluggy/connect-token');
    request.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(errors.at(-1)).toBe('Não foi possível iniciar a conexão com o banco.');
  });

  it('should register an item via POST /api/pluggy/items and prepend it to connections$', () => {
    const connection = buildConnection();
    const emitted: (readonly PluggyConnection[])[] = [];
    service.connections$.subscribe((value) => emitted.push(value));

    service.registerItem('item-1').subscribe();

    const request = httpMock.expectOne('/api/pluggy/items');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ itemId: 'item-1' });
    request.flush(connection);

    expect(emitted.at(-1)).toEqual([connection]);
  });

  it('should replace an existing connection with the same itemId on re-register', () => {
    const existing = buildConnection({ id: 'old', status: 'LOGIN_ERROR' });
    const refreshed = buildConnection({ id: 'new', status: 'UPDATED' });
    const emitted: (readonly PluggyConnection[])[] = [];
    service.connections$.subscribe((value) => emitted.push(value));

    service.loadConnections();
    httpMock.expectOne('/api/pluggy/connections').flush([existing]);

    service.registerItem('item-1').subscribe();
    httpMock.expectOne('/api/pluggy/items').flush(refreshed);

    expect(emitted.at(-1)).toEqual([refreshed]);
  });

  it('should load connections via GET /api/pluggy/connections', () => {
    const connections = [buildConnection()];
    const emitted: (readonly PluggyConnection[])[] = [];
    service.connections$.subscribe((value) => emitted.push(value));

    service.loadConnections();

    const request = httpMock.expectOne('/api/pluggy/connections');
    expect(request.request.method).toBe('GET');
    request.flush(connections);

    expect(emitted.at(-1)).toEqual(connections);
  });

  it('should toggle loading$ around loadConnections', () => {
    const loadingStates: boolean[] = [];
    service.loading$.subscribe((value) => loadingStates.push(value));

    service.loadConnections();
    expect(loadingStates).toEqual([false, true]);

    httpMock.expectOne('/api/pluggy/connections').flush([]);
    expect(loadingStates).toEqual([false, true, false]);
  });

  it('should load transactions via GET /api/pluggy/items/:itemId/transactions', () => {
    const transactions = [buildTransaction()];
    const emitted: (readonly PluggyTransactionPreview[])[] = [];
    service.transactions$.subscribe((value) => emitted.push(value));

    service.loadTransactions('item-9');

    const request = httpMock.expectOne('/api/pluggy/items/item-9/transactions');
    expect(request.request.method).toBe('GET');
    request.flush(transactions);

    expect(emitted.at(-1)).toEqual(transactions);
  });

  it('should include from/to query params when a range is provided', () => {
    service.loadTransactions('item-9', { from: '2026-05-01', to: '2026-06-30' });

    const request = httpMock.expectOne(
      (r) => r.url === '/api/pluggy/items/item-9/transactions',
    );
    expect(request.request.params.get('from')).toBe('2026-05-01');
    expect(request.request.params.get('to')).toBe('2026-06-30');
    request.flush([]);
  });

  it('should materialize a selection via POST /api/pluggy/items/:itemId/materialize', () => {
    const result: MaterializeResult = { created: 2, skipped: 1, fallback: 0, errors: 0 };
    let received: MaterializeResult | undefined;

    service
      .materialize('item-3', { transactionIds: ['tx-1', 'tx-2', 'tx-3'] })
      .subscribe((value) => (received = value));

    const request = httpMock.expectOne('/api/pluggy/items/item-3/materialize');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ transactionIds: ['tx-1', 'tx-2', 'tx-3'] });
    request.flush(result);

    expect(received).toEqual(result);
  });

  it('should materialize all via POST with { all: true }', () => {
    service.materialize('item-3', { all: true }).subscribe();

    const request = httpMock.expectOne('/api/pluggy/items/item-3/materialize');
    expect(request.request.body).toEqual({ all: true });
    request.flush({ created: 5, skipped: 0, fallback: 1, errors: 0 });
  });

  it('should set error$ when materialize fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((value) => errors.push(value));

    service.materialize('item-3', { all: true }).subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    const request = httpMock.expectOne('/api/pluggy/items/item-3/materialize');
    request.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(errors.at(-1)).toBe('Não foi possível importar as transações.');
  });
});
