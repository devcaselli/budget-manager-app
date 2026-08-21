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
import { ReservedBudgetDeleteModeDialogResult } from '@features/reserved-budget/components/reserved-budget-delete-mode-dialog/reserved-budget-delete-mode-dialog.component';
import { PagedReservedBudgetResponse } from '@features/reserved-budget/models/reserved-budget';

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
  delete = vi.fn(
    (_id: string, _mode: 'END' | 'SKIP_MONTH', _walletId: string): Observable<void> => of(undefined),
  );
  findActiveAt = vi.fn(
    (_month: string): Observable<PagedReservedBudgetResponse> =>
      of({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }),
  );
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

  function deleteReservedBudget(item: ReturnType<typeof reservedBudgetItem>): void {
    (component as unknown as { deleteReservedBudget: (item: unknown) => void }).deleteReservedBudget(item);
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

describe('ReservedBudgetPage — soft-delete of 2 modalities (RBM-F13)', () => {
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
        migrations: readonly {
          extraBudgetId: string;
          bulletId: string;
          bulletLabel: string;
          amount: string;
          amountValue: number;
        }[];
      }[];
    }).reservedBudgetItems()[0];
  }

  function deleteReservedBudget(item: ReturnType<typeof reservedBudgetItem>): void {
    (component as unknown as { deleteReservedBudget: (item: unknown) => void }).deleteReservedBudget(item);
  }

  const wallet = buildWallet();

  beforeEach(() => configure());

  describe('normal path (no blocking migration)', () => {
    it('closing with { mode: END, undoBlockingMigrationsFirst: false } calls delete with that mode', () => {
      selectWallet(wallet, [buildReservedBudget({ migrations: [] })]);
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: false }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.delete).toHaveBeenCalledWith('rb-1', 'END', 'wallet-1');
    });

    it('closing with { mode: SKIP_MONTH, undoBlockingMigrationsFirst: false } calls delete with that mode', () => {
      selectWallet(wallet, [buildReservedBudget({ migrations: [] })]);
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({
            mode: 'SKIP_MONTH',
            undoBlockingMigrationsFirst: false,
          }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.delete).toHaveBeenCalledWith('rb-1', 'SKIP_MONTH', 'wallet-1');
    });

    it('cancelling the dialog (undefined result) calls no service', () => {
      selectWallet(wallet, [buildReservedBudget({ migrations: [] })]);
      dialogOpen.mockReturnValue({ afterClosed: () => of(undefined) });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.delete).not.toHaveBeenCalled();
    });

    it('does not open the dialog when there is no selected wallet', () => {
      reservedBudgetService.reservedBudgets$.next([buildReservedBudget({ id: 'rb-2', migrations: [] })]);
      fixture.detectChanges();

      deleteReservedBudget(reservedBudgetItem());

      expect(dialogOpen).not.toHaveBeenCalled();
    });

    it('success reloads the viewed month exactly once, with the wallet effectiveMonth', () => {
      selectWallet(wallet, [buildReservedBudget({ migrations: [] })]);
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: false }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledTimes(1);
      expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledWith('2030-01');
    });

    it('a failed delete triggers zero reloads', () => {
      selectWallet(wallet, [buildReservedBudget({ migrations: [] })]);
      reservedBudgetService.delete.mockReturnValue(throwError(() => new Error('boom')));
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: false }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.loadReservedBudgets).not.toHaveBeenCalled();
    });
  });

  describe('blocking data reaches the dialog', () => {
    it('a card with migrations passes non-empty blockingMigrations with extraBudgetId and bullet label', () => {
      selectWallet(wallet, [buildReservedBudget()]);
      dialogOpen.mockReturnValue({ afterClosed: () => of(undefined) });

      deleteReservedBudget(reservedBudgetItem());

      const [, options] = dialogOpen.mock.calls[0];
      expect(options.data.blockingMigrations).toEqual([
        expect.objectContaining({ extraBudgetId: 'eb-1', bulletLabel: 'Groceries' }),
      ]);
    });
  });

  describe('chained undo-and-end/skip shortcut (RBM-F12a)', () => {
    it('with 1 migration: deleteMigration is called once, then delete — in that order', () => {
      selectWallet(wallet, [buildReservedBudget()]);
      const callOrder: string[] = [];
      reservedBudgetService.deleteMigration.mockImplementation((..._args) => {
        callOrder.push('deleteMigration');
        return of(undefined);
      });
      reservedBudgetService.delete.mockImplementation((..._args) => {
        callOrder.push('delete');
        return of(undefined);
      });
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: true }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.deleteMigration).toHaveBeenCalledTimes(1);
      expect(reservedBudgetService.deleteMigration).toHaveBeenCalledWith('rb-1', 'eb-1');
      expect(reservedBudgetService.delete).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['deleteMigration', 'delete']);
    });

    it('with 3 migrations: deleteMigration called 3x in sequence, delete called once, last', () => {
      const migrations = [
        { extraBudgetId: 'eb-1', bulletId: 'b-1', bulletDescription: 'A', amount: 100, effectiveMonth: '2030-01', description: '' },
        { extraBudgetId: 'eb-2', bulletId: 'b-2', bulletDescription: 'B', amount: 200, effectiveMonth: '2030-01', description: '' },
        { extraBudgetId: 'eb-3', bulletId: 'b-3', bulletDescription: 'C', amount: 300, effectiveMonth: '2030-01', description: '' },
      ];
      selectWallet(wallet, [buildReservedBudget({ migrations })]);
      const callOrder: string[] = [];
      reservedBudgetService.deleteMigration.mockImplementation((_id, extraBudgetId) => {
        callOrder.push(`deleteMigration:${extraBudgetId}`);
        return of(undefined);
      });
      reservedBudgetService.delete.mockImplementation(() => {
        callOrder.push('delete');
        return of(undefined);
      });
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({
            mode: 'SKIP_MONTH',
            undoBlockingMigrationsFirst: true,
          }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.deleteMigration).toHaveBeenCalledTimes(3);
      expect(reservedBudgetService.delete).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([
        'deleteMigration:eb-1',
        'deleteMigration:eb-2',
        'deleteMigration:eb-3',
        'delete',
      ]);
    });

    it('success calls reloadAfterMigration (3 stores), not just loadReservedBudgets alone', () => {
      selectWallet(wallet, [buildReservedBudget()]);
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: true }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledTimes(1);
      expect(bulletService.loadByWalletId).toHaveBeenCalledTimes(1);
      expect(extraBudgetService.loadByWalletId).toHaveBeenCalledTimes(1);
    });

    it('failure on the 2nd of 3 reverts: delete is not called; reloadAfterMigration runs; dialog reopens with fewer blocking migrations', () => {
      const migrations = [
        { extraBudgetId: 'eb-1', bulletId: 'b-1', bulletDescription: 'A', amount: 100, effectiveMonth: '2030-01', description: '' },
        { extraBudgetId: 'eb-2', bulletId: 'b-2', bulletDescription: 'B', amount: 200, effectiveMonth: '2030-01', description: '' },
        { extraBudgetId: 'eb-3', bulletId: 'b-3', bulletDescription: 'C', amount: 300, effectiveMonth: '2030-01', description: '' },
      ];
      selectWallet(wallet, [buildReservedBudget({ migrations })]);
      reservedBudgetService.deleteMigration.mockImplementation((_id, extraBudgetId) =>
        extraBudgetId === 'eb-2' ? throwError(() => new Error('bullet already spent')) : of(undefined),
      );
      // After the partial failure, the reopen path fetches fresh state via findActiveAt — only
      // eb-1 was undone, eb-2/eb-3 remain (eb-2 failed, eb-3 was never attempted by concatMap).
      reservedBudgetService.findActiveAt.mockReturnValue(
        of({
          content: [buildReservedBudget({ migrations: migrations.slice(1) })],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        }),
      );
      // First open: user picks the shortcut. Second open (the reopen after partial failure):
      // user cancels — otherwise mockReturnValue would keep re-emitting the shortcut result and
      // the chain would reopen the dialog indefinitely, which is a real trap in the app too if a
      // caller relies on the same result surviving a reopen.
      dialogOpen
        .mockReturnValueOnce({
          afterClosed: () =>
            of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: true }),
        })
        .mockReturnValueOnce({ afterClosed: () => of(undefined) });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.delete).not.toHaveBeenCalled();
      expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledTimes(1);
      expect(bulletService.loadByWalletId).toHaveBeenCalledTimes(1);
      expect(extraBudgetService.loadByWalletId).toHaveBeenCalledTimes(1);
      expect(dialogOpen).toHaveBeenCalledTimes(2);
      const firstCallData = dialogOpen.mock.calls[0][1].data;
      const secondCallData = dialogOpen.mock.calls[1][1].data;
      expect(secondCallData.blockingMigrations.length).toBeLessThan(
        firstCallData.blockingMigrations.length,
      );
    });

    it('failure on the final delete after all reverts succeed: reloadAfterMigration runs, no createMigration compensating call', () => {
      selectWallet(wallet, [buildReservedBudget()]);
      reservedBudgetService.delete.mockReturnValue(throwError(() => new Error('boom')));
      reservedBudgetService.findActiveAt.mockReturnValue(
        of({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }),
      );
      dialogOpen.mockReturnValue({
        afterClosed: () =>
          of<ReservedBudgetDeleteModeDialogResult>({ mode: 'END', undoBlockingMigrationsFirst: true }),
      });

      deleteReservedBudget(reservedBudgetItem());

      expect(reservedBudgetService.loadReservedBudgets).toHaveBeenCalledTimes(1);
      expect(bulletService.loadByWalletId).toHaveBeenCalledTimes(1);
      expect(extraBudgetService.loadByWalletId).toHaveBeenCalledTimes(1);
      expect(reservedBudgetService.createMigration).not.toHaveBeenCalled();
    });
  });
});
