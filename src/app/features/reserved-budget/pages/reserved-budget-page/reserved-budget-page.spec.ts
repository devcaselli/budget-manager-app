import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import {
  CreateReservedBudgetMigrationRequest,
  ReservedBudget,
} from '@features/reserved-budget/models/reserved-budget';
import { ReservedBudgetService } from '@features/reserved-budget/services/reserved-budget.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { ExtraBudgetService } from '@features/extra-budget/services/extra-budget.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Wallet } from '@features/wallet/models/wallet';
import { ReservedBudgetMigrationDialogResult } from '@features/reserved-budget/components/reserved-budget-migration-dialog/reserved-budget-migration-dialog.component';

import { ReservedBudgetPage } from './reserved-budget-page';

// ── Fakes ──────────────────────────────────────────────────────────────────
// First page spec of the reserved-budget feature (RBM-F9). Scope: only the reload fan-out
// after a migration create/undo (decision #7 / P1) — the most expensive regression this epic
// could reintroduce (money shown stale after a successful mutation). Call-count assertions,
// never "was called" alone: a duplicate reload is a real bug (extra request per mutation) that
// `toHaveBeenCalled()` would let slip through.

class FakeReservedBudgetService {
  readonly reservedBudgets$ = new BehaviorSubject<readonly ReservedBudget[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly updating$ = new BehaviorSubject<string | null>(null);
  readonly linking$ = new BehaviorSubject<string | null>(null);
  readonly migrating$ = new BehaviorSubject<string | null>(null);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);

  loadReservedBudgets = vi.fn();
  createMigration = vi.fn(
    (_id: string, _input: CreateReservedBudgetMigrationRequest): Observable<void> => of(undefined),
  );
  deleteMigration = vi.fn((_id: string, _extraBudgetId: string): Observable<void> => of(undefined));
}

class FakeSubscriptionService {
  readonly subscriptions$ = new BehaviorSubject<readonly unknown[]>([]);
  loadSubscriptions = vi.fn();
}

class FakeInstallmentService {
  readonly allInstallments$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeBulletService {
  readonly bullets$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeExtraBudgetService {
  readonly extraBudgets$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
  loadWallets = vi.fn();
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'wallet-1',
    description: 'Main',
    budget: 1000,
    remaining: 500,
    startDate: '2030-01-01',
    closedDate: null,
    closed: false,
    // Deliberately far from the real current month — if a bug ever reads new Date() instead of
    // the selected wallet's effectiveMonth, this makes the test fail instead of passing by
    // coincidence (RBM-F9 case #2).
    effectiveMonth: '2030-01',
    state: 'PRODUCTION',
    ...overrides,
  };
}

function buildReservedBudget(overrides: Partial<ReservedBudget> = {}): ReservedBudget {
  return {
    id: 'rb-1',
    description: 'Vacation',
    details: null,
    currency: 'BRL',
    startMonth: '2029-01',
    versions: [{ effectiveMonth: '2029-01', amount: 2000 }],
    links: [],
    deleted: false,
    flag: 'NONE',
    consumedAmount: 500,
    remainingAmount: 1500,
    migratedAmount: 0,
    migrations: [
      {
        extraBudgetId: 'eb-1',
        bulletId: 'bullet-1',
        bulletDescription: 'Groceries',
        amount: 200,
        effectiveMonth: '2030-01',
        description: '',
      },
    ],
    ...overrides,
  };
}

describe('ReservedBudgetPage — reload fan-out after migration mutations (RBM-F9)', () => {
  let fixture: ComponentFixture<ReservedBudgetPage>;
  let component: ReservedBudgetPage;
  let reservedBudgetService: FakeReservedBudgetService;
  let bulletService: FakeBulletService;
  let extraBudgetService: FakeExtraBudgetService;
  let walletService: FakeWalletService;
  let dialogOpen: ReturnType<typeof vi.fn>;

  function configure(): void {
    reservedBudgetService = new FakeReservedBudgetService();
    bulletService = new FakeBulletService();
    extraBudgetService = new FakeExtraBudgetService();
    walletService = new FakeWalletService();
    dialogOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [ReservedBudgetPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReservedBudgetService, useValue: reservedBudgetService },
        { provide: SubscriptionService, useClass: FakeSubscriptionService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: BulletService, useValue: bulletService },
        { provide: ExtraBudgetService, useValue: extraBudgetService },
        { provide: WalletService, useValue: walletService },
        { provide: MatDialog, useValue: { open: dialogOpen } },
      ],
    });

    fixture = TestBed.createComponent(ReservedBudgetPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /**
   * Selects a wallet and settles the resulting reserved-budgets list, then resets the load
   * spies so only calls made *after* this point are counted. The effect() in the page's
   * constructor calls loadReservedBudgets/loadByWalletId itself whenever selectedWallet()
   * changes — those calls are expected setup noise, not what these specs are asserting on.
   */
  function selectWallet(wallet: Wallet, reservedBudgets: readonly ReservedBudget[] = []): void {
    walletService.selectedWallet$.next(wallet);
    reservedBudgetService.reservedBudgets$.next(reservedBudgets);
    fixture.detectChanges();
    reservedBudgetService.loadReservedBudgets.mockClear();
    bulletService.loadByWalletId.mockClear();
    extraBudgetService.loadByWalletId.mockClear();
    walletService.loadWallets.mockClear();
  }

  function reservedBudgetItem() {
    return (component as unknown as {
      reservedBudgetItems: () => readonly {
        id: string;
        remainingValue: number | null;
        migrations: readonly { extraBudgetId: string; bulletId: string; bulletLabel: string; amount: string }[];
      }[];
    }).reservedBudgetItems()[0];
  }

  function openMigrationDialog(item: ReturnType<typeof reservedBudgetItem>): void {
    (component as unknown as { openMigrationDialog: (item: unknown) => void }).openMigrationDialog(item);
  }

  function undoMigration(item: ReturnType<typeof reservedBudgetItem>, migration: unknown): void {
    (component as unknown as { undoMigration: (item: unknown, migration: unknown) => void }).undoMigration(
      item,
      migration,
    );
  }

  beforeEach(() => configure());

  it('creation dispatches exactly 3 loads with the selected wallet effectiveMonth', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    dialogOpen.mockReturnValue({
      afterClosed: () => of<ReservedBudgetMigrationDialogResult>({ bulletId: 'bullet-1', amount: 100 }),
    });

    openMigrationDialog(reservedBudgetItem());

    expect(reservedBudgetService.createMigration).toHaveBeenCalledWith('rb-1', {
      walletId: 'wallet-1',
      bulletId: 'bullet-1',
      amount: 100,
    });
    expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledTimes(1);
    expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledWith('2030-01');
    expect(bulletService.loadByWalletId).toHaveBeenCalledTimes(1);
    expect(bulletService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    expect(extraBudgetService.loadByWalletId).toHaveBeenCalledTimes(1);
    expect(extraBudgetService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
  });

  it('walletService.loadWallets is never called by the migration reload fan-out', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    dialogOpen.mockReturnValue({
      afterClosed: () => of<ReservedBudgetMigrationDialogResult>({ bulletId: 'bullet-1', amount: 100 }),
    });

    openMigrationDialog(reservedBudgetItem());

    expect(walletService.loadWallets).not.toHaveBeenCalled();
  });

  it('a failed creation triggers zero reloads', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    reservedBudgetService.createMigration.mockReturnValue(throwError(() => new Error('boom')));
    dialogOpen.mockReturnValue({
      afterClosed: () => of<ReservedBudgetMigrationDialogResult>({ bulletId: 'bullet-1', amount: 100 }),
    });

    openMigrationDialog(reservedBudgetItem());

    expect(reservedBudgetService.loadReservedBudgets).not.toHaveBeenCalled();
    expect(bulletService.loadByWalletId).not.toHaveBeenCalled();
    expect(extraBudgetService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('cancelling the creation dialog calls no service at all', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    dialogOpen.mockReturnValue({ afterClosed: () => of(undefined) });

    openMigrationDialog(reservedBudgetItem());

    expect(reservedBudgetService.createMigration).not.toHaveBeenCalled();
    expect(reservedBudgetService.loadReservedBudgets).not.toHaveBeenCalled();
    expect(bulletService.loadByWalletId).not.toHaveBeenCalled();
    expect(extraBudgetService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('a confirmed undo triggers the same 3 reloads', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    dialogOpen.mockReturnValue({ afterClosed: () => of(true) });

    const item = reservedBudgetItem();
    undoMigration(item, item.migrations[0]);

    expect(reservedBudgetService.deleteMigration).toHaveBeenCalledWith('rb-1', 'eb-1');
    expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledTimes(1);
    expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledWith('2030-01');
    expect(bulletService.loadByWalletId).toHaveBeenCalledTimes(1);
    expect(bulletService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    expect(extraBudgetService.loadByWalletId).toHaveBeenCalledTimes(1);
    expect(extraBudgetService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
  });

  it('a failed undo triggers zero reloads', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    reservedBudgetService.deleteMigration.mockReturnValue(throwError(() => new Error('boom')));
    dialogOpen.mockReturnValue({ afterClosed: () => of(true) });

    const item = reservedBudgetItem();
    undoMigration(item, item.migrations[0]);

    expect(reservedBudgetService.deleteMigration).toHaveBeenCalledWith('rb-1', 'eb-1');
    expect(reservedBudgetService.loadReservedBudgets).not.toHaveBeenCalled();
    expect(bulletService.loadByWalletId).not.toHaveBeenCalled();
    expect(extraBudgetService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('cancelling the undo confirmation calls no service and triggers no reload', () => {
    const wallet = buildWallet();
    selectWallet(wallet, [buildReservedBudget()]);

    dialogOpen.mockReturnValue({ afterClosed: () => of(false) });

    const item = reservedBudgetItem();
    undoMigration(item, item.migrations[0]);

    expect(reservedBudgetService.deleteMigration).not.toHaveBeenCalled();
    expect(reservedBudgetService.loadReservedBudgets).not.toHaveBeenCalled();
    expect(bulletService.loadByWalletId).not.toHaveBeenCalled();
    expect(extraBudgetService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('does nothing when there is no selected wallet', () => {
    // No wallet ever selected — selectedWallet$ stays at its initial null.
    reservedBudgetService.reservedBudgets$.next([buildReservedBudget({ id: 'rb-2' })]);
    fixture.detectChanges();

    dialogOpen.mockReturnValue({
      afterClosed: () => of<ReservedBudgetMigrationDialogResult>({ bulletId: 'bullet-1', amount: 100 }),
    });

    openMigrationDialog(reservedBudgetItem());

    expect(dialogOpen).not.toHaveBeenCalled();
    expect(reservedBudgetService.createMigration).not.toHaveBeenCalled();
  });
});
