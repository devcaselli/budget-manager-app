import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, Observable, of } from 'rxjs';

import {
  MaterializeResult,
  PluggyConnection,
  PluggyItemStatus,
  PluggyTransactionPreview,
} from '../../models/pluggy';
import { PluggyService } from '../../services/pluggy.service';
import {
  PluggyWidgetHandlers,
  PluggyWidgetService,
} from '../../services/pluggy-widget.service';
import { ConnectedAccountsPage } from './connected-accounts-page';

// ── Fake service ─────────────────────────────────────────────────────────────
class FakePluggyService {
  readonly connections$ = new BehaviorSubject<readonly PluggyConnection[]>([]);
  readonly transactions$ = new BehaviorSubject<readonly PluggyTransactionPreview[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);

  loadConnections = vi.fn();
  loadTransactions = vi.fn();
  materialize = vi.fn<(id: string, payload: unknown) => Observable<MaterializeResult>>(() =>
    of({ created: 0, skipped: 0, fallback: 0, errors: 0 }),
  );
  getConnectToken = vi.fn<(itemId?: string) => Observable<string>>(() => of('ct-token'));
  /** Each getItemStatus call returns the next value from this queue. */
  statusQueue: PluggyItemStatus[] = [];
  getItemStatus = vi.fn<(itemId: string) => Observable<PluggyItemStatus>>(() =>
    of(this.statusQueue.shift() ?? 'UPDATING'),
  );
}

// ── Fake widget: captures handlers so tests can trigger onSuccess/onExit. ─────
class FakePluggyWidgetService {
  lastHandlers: PluggyWidgetHandlers | null = null;
  lastUpdateItemId: string | null = null;
  openUpdate = vi.fn(
    (_token: string, itemId: string, handlers: PluggyWidgetHandlers): Promise<void> => {
      this.lastUpdateItemId = itemId;
      this.lastHandlers = handlers;
      return Promise.resolve();
    },
  );
}

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

function buildTx(overrides: Partial<PluggyTransactionPreview> = {}): PluggyTransactionPreview {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    description: 'Supermercado',
    amount: -120.5,
    currency: 'BRL',
    date: '2026-06-10',
    alreadyImported: false,
    isExpense: true,
    ...overrides,
  };
}

type Internals = {
  selectableTransactions: () => readonly PluggyTransactionPreview[];
  allSelectableChecked: () => boolean;
  selectedCount: () => number;
  isSelectable: (tx: PluggyTransactionPreview) => boolean;
  isChecked: (tx: PluggyTransactionPreview) => boolean;
  toggleTransaction: (tx: PluggyTransactionPreview) => void;
  toggleSelectAll: () => void;
  selectConnection: (c: PluggyConnection) => void;
  importSelected: () => void;
  importAll: () => void;
  refreshConnection: (c: PluggyConnection) => void;
  isSyncing: (itemId: string) => boolean;
  syncingItemId: () => string | null;
  syncMessage: () => string | null;
  syncError: () => string | null;
};

describe('ConnectedAccountsPage — selection & materialize', () => {
  let fixture: ComponentFixture<ConnectedAccountsPage>;
  let component: ConnectedAccountsPage;
  let service: FakePluggyService;

  function api(): Internals {
    return component as unknown as Internals;
  }

  beforeEach(() => {
    service = new FakePluggyService();

    TestBed.configureTestingModule({
      imports: [ConnectedAccountsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PluggyService, useValue: service },
        { provide: PluggyWidgetService, useClass: FakePluggyWidgetService },
      ],
    });

    fixture = TestBed.createComponent(ConnectedAccountsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads connections on init', () => {
    expect(service.loadConnections).toHaveBeenCalledTimes(1);
  });

  it('loads transactions when a connection is selected', () => {
    api().selectConnection(buildConnection());
    fixture.detectChanges();

    expect(service.loadTransactions).toHaveBeenCalledWith('item-1');
  });

  it('treats only outgoing, non-imported transactions as selectable', () => {
    service.transactions$.next([
      buildTx({ id: 'expense', isExpense: true, alreadyImported: false }),
      buildTx({ id: 'imported', isExpense: true, alreadyImported: true }),
      buildTx({ id: 'credit', isExpense: false, alreadyImported: false, amount: 300 }),
    ]);
    fixture.detectChanges();

    const selectable = api().selectableTransactions().map((t) => t.id);
    expect(selectable).toEqual(['expense']);
    expect(api().isSelectable(buildTx({ id: 'credit', isExpense: false }))).toBe(false);
    expect(api().isSelectable(buildTx({ id: 'imported', alreadyImported: true }))).toBe(false);
  });

  it('toggles a selectable transaction but ignores non-selectable ones', () => {
    const expense = buildTx({ id: 'expense' });
    const credit = buildTx({ id: 'credit', isExpense: false, amount: 10 });

    api().toggleTransaction(expense);
    expect(api().isChecked(expense)).toBe(true);
    expect(api().selectedCount()).toBe(1);

    api().toggleTransaction(expense);
    expect(api().isChecked(expense)).toBe(false);

    api().toggleTransaction(credit);
    expect(api().isChecked(credit)).toBe(false);
    expect(api().selectedCount()).toBe(0);
  });

  it('select-all checks only selectable rows and skips credits/imported', () => {
    service.transactions$.next([
      buildTx({ id: 'e1' }),
      buildTx({ id: 'e2' }),
      buildTx({ id: 'imported', alreadyImported: true }),
      buildTx({ id: 'credit', isExpense: false }),
    ]);
    fixture.detectChanges();

    api().toggleSelectAll();
    expect(api().selectedCount()).toBe(2);
    expect(api().allSelectableChecked()).toBe(true);

    // Toggling again clears everything.
    api().toggleSelectAll();
    expect(api().selectedCount()).toBe(0);
    expect(api().allSelectableChecked()).toBe(false);
  });

  it('allSelectableChecked is false when there are no selectable rows', () => {
    service.transactions$.next([buildTx({ id: 'credit', isExpense: false })]);
    fixture.detectChanges();

    expect(api().allSelectableChecked()).toBe(false);
  });

  it('importSelected materializes the checked ids and reloads', () => {
    api().selectConnection(buildConnection());
    service.transactions$.next([buildTx({ id: 'e1' }), buildTx({ id: 'e2' })]);
    fixture.detectChanges();

    api().toggleTransaction(buildTx({ id: 'e1' }));
    api().importSelected();

    expect(service.materialize).toHaveBeenCalledWith('item-1', { transactionIds: ['e1'] });
    // reload after success
    expect(service.loadTransactions).toHaveBeenLastCalledWith('item-1');
  });

  it('importSelected is a no-op when nothing is selected', () => {
    api().selectConnection(buildConnection());
    fixture.detectChanges();
    service.materialize.mockClear();

    api().importSelected();

    expect(service.materialize).not.toHaveBeenCalled();
  });

  it('importAll materializes with { all: true }', () => {
    api().selectConnection(buildConnection());
    fixture.detectChanges();

    api().importAll();

    expect(service.materialize).toHaveBeenCalledWith('item-1', { all: true });
  });

  it('clears selection after a successful materialize', () => {
    api().selectConnection(buildConnection());
    service.transactions$.next([buildTx({ id: 'e1' })]);
    fixture.detectChanges();

    api().toggleTransaction(buildTx({ id: 'e1' }));
    expect(api().selectedCount()).toBe(1);

    api().importSelected();
    expect(api().selectedCount()).toBe(0);
  });
});

describe('ConnectedAccountsPage — update-mode refresh flow', () => {
  let fixture: ComponentFixture<ConnectedAccountsPage>;
  let component: ConnectedAccountsPage;
  let service: FakePluggyService;
  let widget: FakePluggyWidgetService;

  function api(): Internals {
    return component as unknown as Internals;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    service = new FakePluggyService();
    widget = new FakePluggyWidgetService();

    TestBed.configureTestingModule({
      imports: [ConnectedAccountsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PluggyService, useValue: service },
        { provide: PluggyWidgetService, useValue: widget },
      ],
    });

    fixture = TestBed.createComponent(ConnectedAccountsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Advance the RxJS timer past `n` poll ticks and let microtasks settle. */
  async function advancePolls(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await vi.advanceTimersByTimeAsync(2500);
    }
  }

  it('requests an update-mode token then opens the widget in update mode', () => {
    api().refreshConnection(buildConnection());

    expect(service.getConnectToken).toHaveBeenCalledWith('item-1');
    expect(widget.openUpdate).toHaveBeenCalled();
    expect(widget.lastUpdateItemId).toBe('item-1');
    expect(api().isSyncing('item-1')).toBe(true);
  });

  it('polls status after onSuccess and reloads transactions once UPDATED', async () => {
    // Select the connection so the reload targets it.
    api().selectConnection(buildConnection());
    service.loadTransactions.mockClear();

    service.statusQueue = ['UPDATING', 'UPDATING', 'UPDATED'];

    api().refreshConnection(buildConnection());
    // Widget UI finished — kick off polling.
    widget.lastHandlers?.onSuccess('item-1');

    await advancePolls(3);

    expect(service.getItemStatus).toHaveBeenCalledWith('item-1');
    expect(service.getItemStatus.mock.calls.length).toBe(3);
    expect(service.loadTransactions).toHaveBeenLastCalledWith('item-1');
    expect(api().syncMessage()).toBe('Dados atualizados');
    expect(api().isSyncing('item-1')).toBe(false);
  });

  it('stops polling and surfaces an error on a terminal LOGIN_ERROR status', async () => {
    api().selectConnection(buildConnection());
    service.loadTransactions.mockClear();

    service.statusQueue = ['UPDATING', 'LOGIN_ERROR', 'UPDATED'];

    api().refreshConnection(buildConnection());
    widget.lastHandlers?.onSuccess('item-1');

    await advancePolls(3);

    // Should have stopped at LOGIN_ERROR (2 calls), never reaching the 3rd.
    expect(service.getItemStatus.mock.calls.length).toBe(2);
    expect(service.loadTransactions).not.toHaveBeenCalled();
    expect(api().syncError()).toBeTruthy();
    expect(api().isSyncing('item-1')).toBe(false);
  });

  it('does not start a second refresh while one is in progress', () => {
    api().refreshConnection(buildConnection());
    service.getConnectToken.mockClear();

    api().refreshConnection(buildConnection({ id: 'conn-2', itemId: 'item-2' }));

    expect(service.getConnectToken).not.toHaveBeenCalled();
  });
});
