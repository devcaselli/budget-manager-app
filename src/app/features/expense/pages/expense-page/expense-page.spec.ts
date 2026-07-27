import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { BulletService } from '@features/bullet/services/bullet.service';
import { ExpenseService } from '@features/expense/services/expense.service';
import { PaymentService } from '@features/payment/services/payment.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { ShareService } from '@features/share/services/share.service';
import { TagService } from '@features/tag/services/tag.service';
import { SyncService } from '@features/sync/services/sync.service';
import { SyncIngestResult, SyncReport } from '@features/sync/models/sync';
import { PendingReviewService } from '@features/pending-review/services/pending-review.service';
import { Tag } from '@features/tag/models/tag';
import { Expense } from '@features/expense/models/expense';
import { Share } from '@features/share/models/share';
import { Wallet } from '@features/wallet/models/wallet';
import { Payer } from '@features/payer/models/payer';

import { ExpensePage } from './expense-page';

// ── Fakes ──────────────────────────────────────────────────────────────────
// The bugs under test live in ExpensePage's `expenseItems` computed (the share
// derivation) and the template's `@if (!expense.hasShare)` guard, both driven by
// ShareService.shares$. We stub the injected services so the test drives shares$/
// expenses$/selectedWallet$ directly, with no HTTP wiring.

class FakeExpenseService {
  readonly expenses$ = new BehaviorSubject<readonly Expense[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadByWalletId = vi.fn();
  assignTags = vi.fn().mockReturnValue(of(buildExpense()));
}

class FakeTagService {
  readonly tags$ = new BehaviorSubject<readonly Tag[]>([]);
  loadAll = vi.fn();
}

class FakeShareService {
  readonly shares$ = new BehaviorSubject<readonly Share[]>([]);
  loadAll = vi.fn();
}

class FakePaymentService {
  readonly payments$ = new BehaviorSubject<readonly unknown[]>([]);
  readonly paying$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadByWalletId = vi.fn();
}

class FakeBulletService {
  readonly bullets$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeInstallmentService {
  readonly creditCards$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
  findPayersByWalletId(): Observable<Payer[]> {
    return of([]);
  }
}

function buildSyncReport(overrides: Partial<SyncReport> = {}): SyncReport {
  return { created: 0, skipped: 0, fallback: 0, errors: 0, ...overrides };
}

function buildSyncIngestResult(overrides: Partial<SyncReport> = {}): SyncIngestResult {
  return { report: buildSyncReport(overrides), pendingReviews: [] };
}

class FakeSyncService {
  readonly syncing$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  ingest = vi.fn().mockReturnValue(of(buildSyncIngestResult()));
}

class FakePendingReviewService {
  readonly pendingReviews$ = new BehaviorSubject<readonly unknown[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  applySyncResult = vi.fn();
}

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    name: 'Groceries',
    cost: 100,
    purchaseDate: '2026-06-01',
    remaining: 100,
    walletId: 'wallet-1',
    bulletId: null,
    creditCardId: 'card-1',
    installment: false,
    installmentNumber: null,
    installmentId: null,
    ...overrides,
  };
}

function buildShare(overrides: Partial<Share> = {}): Share {
  return {
    id: 'share-1',
    walletId: 'wallet-1',
    sourceType: 'EXPENSE',
    sourceId: 'expense-1',
    sourceName: 'Some expense',
    totalAmount: 100,
    ownerShare: 70,
    ownerRatio: 0.7,
    currency: 'BRL',
    status: 'ACTIVE',
    quotas: [{ payerId: 'payer-1', payerName: 'Maria', ratio: 0.3, amount: 30, paymentIds: [] }],
    paymentIds: [],
    createdAt: '2026-06-01T10:00:00Z',
    revertedAt: null,
    stoppedFromMonth: null,
    ...overrides,
  };
}

describe('ExpensePage — share derivation & split button visibility', () => {
  let fixture: ComponentFixture<ExpensePage>;
  let component: ExpensePage;
  let expenseService: FakeExpenseService;
  let shareService: FakeShareService;
  let syncService: FakeSyncService;
  let pendingReviewService: FakePendingReviewService;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogAfterClosed: BehaviorSubject<unknown>;

  beforeEach(() => {
    expenseService = new FakeExpenseService();
    shareService = new FakeShareService();
    syncService = new FakeSyncService();
    pendingReviewService = new FakePendingReviewService();
    dialogAfterClosed = new BehaviorSubject<unknown>(undefined);
    dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => dialogAfterClosed.asObservable(),
      } as unknown as MatDialogRef<unknown>),
    };

    TestBed.configureTestingModule({
      imports: [ExpensePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ExpenseService, useValue: expenseService },
        { provide: ShareService, useValue: shareService },
        { provide: PaymentService, useClass: FakePaymentService },
        { provide: BulletService, useClass: FakeBulletService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: TagService, useClass: FakeTagService },
        { provide: SyncService, useValue: syncService },
        { provide: PendingReviewService, useValue: pendingReviewService },
        { provide: MatDialog, useValue: dialog },
      ],
    });

    fixture = TestBed.createComponent(ExpensePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function expenseItems() {
    return (component as unknown as { expenseItems: () => readonly { id: string; hasShare: boolean; shareSummary: string }[] }).expenseItems();
  }

  it('marks an expense as not shared when no active EXPENSE share targets it', () => {
    expenseService.expenses$.next([buildExpense()]);
    shareService.shares$.next([]);
    fixture.detectChanges();

    const [item] = expenseItems();
    expect(item.hasShare).toBe(false);
    expect(item.shareSummary).toBe('');
  });

  it('marks an expense as shared and builds a summary from active share quotas', () => {
    expenseService.expenses$.next([buildExpense()]);
    shareService.shares$.next([buildShare()]);
    fixture.detectChanges();

    const [item] = expenseItems();
    expect(item.hasShare).toBe(true);
    expect(item.shareSummary).toContain('Maria');
  });

  it('ignores REVERTED shares and shares targeting a different expense', () => {
    expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
    shareService.shares$.next([
      buildShare({ id: 's-rev', status: 'REVERTED' }),
      buildShare({ id: 's-other', sourceId: 'expense-2' }),
    ]);
    fixture.detectChanges();

    const [item] = expenseItems();
    expect(item.hasShare).toBe(false);
  });

  it('ignores non-EXPENSE shares that happen to share the same sourceId', () => {
    expenseService.expenses$.next([buildExpense({ id: 'shared-id' })]);
    shareService.shares$.next([
      buildShare({ id: 's-sub', sourceType: 'SUBSCRIPTION', sourceId: 'shared-id' }),
    ]);
    fixture.detectChanges();

    const [item] = expenseItems();
    expect(item.hasShare).toBe(false);
  });

  it('renders the split button only for expenses without an active share', () => {
    expenseService.expenses$.next([
      buildExpense({ id: 'expense-1' }),
      buildExpense({ id: 'expense-2', name: 'Fuel' }),
    ]);
    shareService.shares$.next([buildShare({ sourceId: 'expense-1' })]);
    fixture.detectChanges();

    const splitButtons = fixture.nativeElement.querySelectorAll('button[title="Split expense"]');
    // expense-1 is shared (button hidden), expense-2 is not (button shown).
    expect(splitButtons.length).toBe(1);
  });

  it('openShareDialog is a no-op when the expense already has an active share', () => {
    // A wallet must be selected, otherwise the earlier `!wallet` guard would short-circuit
    // and we would not be exercising the hasShare guard specifically.
    const walletService = TestBed.inject(WalletService) as unknown as {
      selectedWallet$: BehaviorSubject<Wallet | null>;
    };
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog) as unknown as { open: ReturnType<typeof vi.fn> };
    const sharedItem = { id: 'expense-1', hasShare: true } as never;

    (component as unknown as { openShareDialog: (e: never) => void }).openShareDialog(sharedItem);

    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('assigns tags after the picker dialog is confirmed', () => {
    expenseService.expenses$.next([buildExpense()]);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog) as unknown as { open: ReturnType<typeof vi.fn> };
    dialog.open.mockReturnValue({ afterClosed: () => of(['tag-1', 'tag-2']) });

    const [item] = expenseItems();
    (component as unknown as { onTagsClick: (e: unknown) => void }).onTagsClick(item);

    expect(expenseService.assignTags).toHaveBeenCalledWith('expense-1', ['tag-1', 'tag-2']);
  });

  it('does not assign tags when the picker dialog is cancelled', () => {
    expenseService.expenses$.next([buildExpense()]);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog) as unknown as { open: ReturnType<typeof vi.fn> };
    dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });

    const [item] = expenseItems();
    (component as unknown as { onTagsClick: (e: unknown) => void }).onTagsClick(item);

    expect(expenseService.assignTags).not.toHaveBeenCalled();
  });

  it('calls SyncService.ingest, applies the result to PendingReviewService, and opens the review dialog', () => {
    const walletService = TestBed.inject(WalletService) as unknown as {
      selectedWallet$: BehaviorSubject<Wallet | null>;
    };
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    const result = buildSyncIngestResult({ created: 3, skipped: 1 });
    syncService.ingest.mockReturnValue(of(result));

    (component as unknown as { syncNow: () => void }).syncNow();

    expect(syncService.ingest).toHaveBeenCalled();
    expect(pendingReviewService.applySyncResult).toHaveBeenCalledWith(result);
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('reloads the wallet expenses when the review dialog closes, even with no new items at sync time', () => {
    const walletService = TestBed.inject(WalletService) as unknown as {
      selectedWallet$: BehaviorSubject<Wallet | null>;
    };
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    // Expense creation now happens inside the modal on confirm, not at sync time, so
    // `report.created === 0` must still reload once the dialog closes — items may have
    // been confirmed during the dialog session (CA #6). The fake dialog's `afterClosed()`
    // is a BehaviorSubject, so closing is observed synchronously on subscribe here.
    syncService.ingest.mockReturnValue(of(buildSyncIngestResult({ created: 0, skipped: 4 })));
    expenseService.loadByWalletId.mockClear();

    (component as unknown as { syncNow: () => void }).syncNow();

    expect(expenseService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
  });

  it('reloads again if the dialog is closed a second time (no stale unconditional-reload guard)', () => {
    const walletService = TestBed.inject(WalletService) as unknown as {
      selectedWallet$: BehaviorSubject<Wallet | null>;
    };
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    syncService.ingest.mockReturnValue(of(buildSyncIngestResult({ created: 0 })));
    expenseService.loadByWalletId.mockClear();

    (component as unknown as { syncNow: () => void }).syncNow();
    expect(expenseService.loadByWalletId).toHaveBeenCalledTimes(1);

    dialogAfterClosed.next(undefined);

    expect(expenseService.loadByWalletId).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when a sync is already in flight', () => {
    syncService.syncing$.next(true);
    fixture.detectChanges();

    (component as unknown as { syncNow: () => void }).syncNow();

    expect(syncService.ingest).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });
});

describe('ExpensePage — unhidden filter checkbox (Task 8a) & share indicator (Task 8b verification)', () => {
  let fixture: ComponentFixture<ExpensePage>;
  let component: ExpensePage;
  let expenseService: FakeExpenseService;
  let shareService: FakeShareService;
  let bulletService: { loadByWalletId: ReturnType<typeof vi.fn> };
  let paymentService: { loadByWalletId: ReturnType<typeof vi.fn> };
  let installmentService: { loadByWalletId: ReturnType<typeof vi.fn> };
  let walletService: { selectedWallet$: BehaviorSubject<Wallet | null> };

  function filtersForm() {
    return (component as unknown as { filtersForm: { controls: { unhidden: { setValue: (v: boolean) => void } } } }).filtersForm;
  }

  function expenseItems() {
    return (
      component as unknown as {
        expenseItems: () => readonly {
          id: string;
          hasShare: boolean;
          shareSummary: string;
          statusLabel: string;
          cost: number;
          remaining: number;
          paid: number;
        }[];
      }
    ).expenseItems();
  }

  beforeEach(() => {
    expenseService = new FakeExpenseService();
    shareService = new FakeShareService();

    TestBed.configureTestingModule({
      imports: [ExpensePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ExpenseService, useValue: expenseService },
        { provide: ShareService, useValue: shareService },
        { provide: PaymentService, useClass: FakePaymentService },
        { provide: BulletService, useClass: FakeBulletService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: TagService, useClass: FakeTagService },
        { provide: SyncService, useClass: FakeSyncService },
        { provide: PendingReviewService, useClass: FakePendingReviewService },
        {
          provide: MatDialog,
          useValue: { open: vi.fn().mockReturnValue({ afterClosed: () => of(undefined) }) },
        },
      ],
    });

    fixture = TestBed.createComponent(ExpensePage);
    component = fixture.componentInstance;
    bulletService = TestBed.inject(BulletService) as unknown as typeof bulletService;
    paymentService = TestBed.inject(PaymentService) as unknown as typeof paymentService;
    installmentService = TestBed.inject(InstallmentService) as unknown as typeof installmentService;
    walletService = TestBed.inject(WalletService) as unknown as typeof walletService;
    fixture.detectChanges();
  });

  it('checkbox off by default: switching wallet loads expenses without unhidden=true', () => {
    expenseService.loadByWalletId.mockClear();

    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    expect(expenseService.loadByWalletId).toHaveBeenCalledWith('wallet-1', false);
  });

  it('toggling the checkbox on re-fetches expenses for the current wallet with unhidden=true', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();
    expenseService.loadByWalletId.mockClear();

    filtersForm().controls.unhidden.setValue(true);
    fixture.detectChanges();

    expect(expenseService.loadByWalletId).toHaveBeenCalledWith('wallet-1', true);
  });

  it('switching wallet with the checkbox on keeps passing unhidden=true (no silent filter reset)', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();
    filtersForm().controls.unhidden.setValue(true);
    fixture.detectChanges();
    expenseService.loadByWalletId.mockClear();

    walletService.selectedWallet$.next({ id: 'wallet-2' } as Wallet);
    fixture.detectChanges();

    expect(expenseService.loadByWalletId).toHaveBeenCalledWith('wallet-2', true);
  });

  it('toggling the checkbox does NOT re-trigger bullet/payment/installment/share loads or resetForm', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    bulletService.loadByWalletId.mockClear();
    paymentService.loadByWalletId.mockClear();
    installmentService.loadByWalletId.mockClear();
    shareService.loadAll.mockClear();
    const resetFormSpy = vi.spyOn(component as unknown as { resetForm: () => void }, 'resetForm' as never);

    filtersForm().controls.unhidden.setValue(true);
    fixture.detectChanges();

    expect(bulletService.loadByWalletId).not.toHaveBeenCalled();
    expect(paymentService.loadByWalletId).not.toHaveBeenCalled();
    expect(installmentService.loadByWalletId).not.toHaveBeenCalled();
    expect(shareService.loadAll).not.toHaveBeenCalled();
    expect(resetFormSpy).not.toHaveBeenCalled();
  });

  it('8b: a fully-shared expense (remaining 0, active share) renders the share indicator, PAID pill, and struck-through original cost', () => {
    expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100, remaining: 0 })]);
    shareService.shares$.next([buildShare({ sourceId: 'expense-1' })]);
    fixture.detectChanges();

    const [item] = expenseItems();
    expect(item.hasShare).toBe(true);
    expect(item.shareSummary).toContain('Maria');
    expect(item.statusLabel).toBe('PAID');
    expect(item.paid).toBe(100);

    const indicator = fixture.nativeElement.querySelector('.ep-share-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.getAttribute('title')).toContain('Maria');

    const pill = fixture.nativeElement.querySelector('.ew-pill--paid');
    expect(pill).toBeTruthy();

    const originalCost = fixture.nativeElement.querySelector('.ep-amount-original');
    expect(originalCost).toBeTruthy();

    // Split button must stay hidden — already-shared expenses don't offer a re-split.
    expect(fixture.nativeElement.querySelector('button[title="Split expense"]')).toBeNull();
  });

  it('regression: expense without a share and expense with a partial share behave unchanged', () => {
    expenseService.expenses$.next([
      buildExpense({ id: 'expense-1', cost: 100, remaining: 100 }),
      buildExpense({ id: 'expense-2', cost: 200, remaining: 150 }),
    ]);
    shareService.shares$.next([buildShare({ sourceId: 'expense-2' })]);
    fixture.detectChanges();

    const [unshared, partiallyShared] = expenseItems();
    expect(unshared.hasShare).toBe(false);
    expect(unshared.statusLabel).toBe('OPEN');

    expect(partiallyShared.hasShare).toBe(true);
    expect(partiallyShared.statusLabel).toBe('OPEN');
    expect(partiallyShared.remaining).toBe(150);
  });
});
