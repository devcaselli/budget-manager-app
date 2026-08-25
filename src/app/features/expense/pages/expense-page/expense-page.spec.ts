import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { OmegaViewerLauncher } from '@shared/components/omega-viewer/omega-viewer-launcher';
import { OmegaViewerResult } from '@shared/components/omega-viewer/models/omega-viewer-result';
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

class FakeOmegaViewerLauncher {
  readonly result$ = new BehaviorSubject<OmegaViewerResult>({ mutated: false });
  open = vi.fn().mockReturnValue(this.result$.asObservable());
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
    quotas: [{ payerId: 'payer-1', payerName: 'Maria', ratio: 0.3, amount: 30, monthlyAmount: 30, paymentIds: [] }],
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
  let omegaViewerLauncher: FakeOmegaViewerLauncher;

  beforeEach(() => {
    expenseService = new FakeExpenseService();
    shareService = new FakeShareService();
    syncService = new FakeSyncService();
    pendingReviewService = new FakePendingReviewService();
    omegaViewerLauncher = new FakeOmegaViewerLauncher();
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
        { provide: OmegaViewerLauncher, useValue: omegaViewerLauncher },
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

  describe('openViewer — Omega Viewer launcher integration (F-14)', () => {
    it('opens the launcher with the EXPENSE ref and does NOT reload the list when the result is unmutated', () => {
      const walletService = TestBed.inject(WalletService) as unknown as {
        selectedWallet$: BehaviorSubject<Wallet | null>;
      };
      walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
      expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
      fixture.detectChanges();
      expenseService.loadByWalletId.mockClear();

      const [item] = expenseItems();
      (component as unknown as { openViewer: (e: unknown) => void }).openViewer(item);

      expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'EXPENSE', id: 'expense-1' });

      omegaViewerLauncher.result$.next({ mutated: false });

      expect(expenseService.loadByWalletId).not.toHaveBeenCalled();
    });

    it('reloads the wallet expenses when the launcher result reports mutated:true', () => {
      const walletService = TestBed.inject(WalletService) as unknown as {
        selectedWallet$: BehaviorSubject<Wallet | null>;
      };
      walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
      expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
      fixture.detectChanges();
      expenseService.loadByWalletId.mockClear();

      const [item] = expenseItems();
      (component as unknown as { openViewer: (e: unknown) => void }).openViewer(item);

      omegaViewerLauncher.result$.next({ mutated: true });

      expect(expenseService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    });

    it('opens the viewer from the name-cell keyboard trigger (Enter) — role=button, tabindex=0', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', name: 'Groceries' })]);
      fixture.detectChanges();

      const nameCell = fixture.nativeElement.querySelector('td[role="button"]');
      expect(nameCell).toBeTruthy();
      expect(nameCell.getAttribute('tabindex')).toBe('0');

      nameCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'EXPENSE', id: 'expense-1' });
    });

    it('opens the viewer from the name-cell keyboard trigger (Space)', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', name: 'Groceries' })]);
      fixture.detectChanges();

      const nameCell = fixture.nativeElement.querySelector('td[role="button"]');
      nameCell.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'EXPENSE', id: 'expense-1' });
    });

    it('opens the viewer from the visibility icon button in the row actions cluster', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', name: 'Groceries' })]);
      fixture.detectChanges();

      const viewButton = fixture.nativeElement.querySelector('button[title="View expense"]');
      expect(viewButton).toBeTruthy();

      viewButton.click();

      expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'EXPENSE', id: 'expense-1' });
    });
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
        { provide: OmegaViewerLauncher, useClass: FakeOmegaViewerLauncher },
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

describe('ExpensePage — D6 redesign: stat cards, toolbar, layouts, chips, import banner', () => {
  let fixture: ComponentFixture<ExpensePage>;
  let component: ExpensePage;
  let expenseService: FakeExpenseService;
  let pendingReviewService: FakePendingReviewService;

  function query<T extends Element = Element>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function queryAll<T extends Element = Element>(selector: string): T[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector));
  }

  beforeEach(() => {
    expenseService = new FakeExpenseService();
    pendingReviewService = new FakePendingReviewService();

    TestBed.configureTestingModule({
      imports: [ExpensePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ExpenseService, useValue: expenseService },
        { provide: ShareService, useClass: FakeShareService },
        { provide: PaymentService, useClass: FakePaymentService },
        { provide: BulletService, useClass: FakeBulletService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: TagService, useClass: FakeTagService },
        { provide: SyncService, useClass: FakeSyncService },
        { provide: PendingReviewService, useValue: pendingReviewService },
        {
          provide: MatDialog,
          useValue: { open: vi.fn().mockReturnValue({ afterClosed: () => of(undefined) }) },
        },
        { provide: OmegaViewerLauncher, useClass: FakeOmegaViewerLauncher },
      ],
    });

    fixture = TestBed.createComponent(ExpensePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Stat cards ─────────────────────────────────────────────────────────

  it('stat cards: total/open/paid and the paid-vs-open percentage derive from loaded expenses', () => {
    expenseService.expenses$.next([
      buildExpense({ id: 'e1', cost: 100, remaining: 0 }), // PAID
      buildExpense({ id: 'e2', cost: 300, remaining: 300 }), // OPEN
    ]);
    fixture.detectChanges();

    const c = component as unknown as {
      totalCost: () => number;
      totalOpen: () => number;
      totalPaid: () => number;
      paidPercent: () => number;
      openCount: () => number;
    };
    expect(c.totalCost()).toBe(400);
    expect(c.totalOpen()).toBe(300);
    expect(c.totalPaid()).toBe(100);
    expect(c.paidPercent()).toBe(25);
    expect(c.openCount()).toBe(1);
  });

  it('paidPercent is 0 (not NaN) when there are no expenses at all', () => {
    expenseService.expenses$.next([]);
    fixture.detectChanges();

    const c = component as unknown as { paidPercent: () => number };
    expect(c.paidPercent()).toBe(0);
  });

  it('binds the paid-bar width via [style.--bar-width.%] — a CSS custom property, not a concatenated inline style object', () => {
    expenseService.expenses$.next([buildExpense({ id: 'e1', cost: 200, remaining: 50 })]);
    fixture.detectChanges();

    const fill = query('.ep-stat-bar-fill') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.getPropertyValue('--bar-width')).toBe('75%');
  });

  // ── Import-pending banner ─────────────────────────────────────────────

  it('shows the import banner reusing PendingReviewService.pendingReviews$, with the live count', () => {
    pendingReviewService.pendingReviews$.next([{}, {}] as never);
    fixture.detectChanges();

    const banner = query('.ep-import-banner');
    expect(banner).toBeTruthy();
    expect(banner!.textContent).toContain('2 imported expense(s) waiting for review');
  });

  it('hides the import banner when there are no pending reviews', () => {
    pendingReviewService.pendingReviews$.next([]);
    fixture.detectChanges();

    expect(query('.ep-import-banner')).toBeNull();
  });

  it('dismissing the banner ("Later") hides it until the pending count changes again', () => {
    pendingReviewService.pendingReviews$.next([{}] as never);
    fixture.detectChanges();

    const laterBtn = queryAll('.ep-banner-btn--ghost').find((b) => b.textContent?.trim() === 'Later');
    laterBtn!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(query('.ep-import-banner')).toBeNull();
  });

  // ── Status tabs (sliding thumb) ────────────────────────────────────────

  it('status tabs: clicking Open/Paid/All updates the filters form and the thumb index', () => {
    const c = component as unknown as { statusTabIndex: () => number };
    expect(c.statusTabIndex()).toBe(0); // ALL by default

    const openTab = queryAll('.ep-status-tab').find((b) => b.textContent?.trim() === 'Open')!;
    openTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(c.statusTabIndex()).toBe(1);

    const paidTab = queryAll('.ep-status-tab').find((b) => b.textContent?.trim() === 'Paid')!;
    paidTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(c.statusTabIndex()).toBe(2);
  });

  it('status tab click actually filters the ledger by status', () => {
    expenseService.expenses$.next([
      buildExpense({ id: 'e1', cost: 100, remaining: 0 }), // PAID
      buildExpense({ id: 'e2', cost: 100, remaining: 100 }), // OPEN
    ]);
    fixture.detectChanges();

    const paidTab = queryAll('.ep-status-tab').find((b) => b.textContent?.trim() === 'Paid')!;
    paidTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const filtered = (component as unknown as { filteredExpenseItems: () => readonly { id: string }[] })
      .filteredExpenseItems();
    expect(filtered.map((i) => i.id)).toEqual(['e1']);
  });

  // ── Layout tabs (Table / By day) ────────────────────────────────────────

  it('layout tabs: defaults to Table (ledger) and switches to grouped-by-day on click', () => {
    expenseService.expenses$.next([buildExpense({ id: 'e1' })]);
    fixture.detectChanges();

    expect(query('.ew-table')).toBeTruthy();
    expect(query('.ep-day-groups')).toBeNull();

    const byDayTab = queryAll('.ep-layout-tab').find((b) => b.textContent?.trim() === 'By day')!;
    byDayTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(query('.ew-table')).toBeNull();
    expect(query('.ep-day-groups')).toBeTruthy();
  });

  // ── Filter chips ──────────────────────────────────────────────────────

  function filtersForm() {
    return (
      component as unknown as {
        filtersForm: {
          controls: {
            search: { setValue: (v: string) => void };
            paymentStatus: { setValue: (v: string) => void };
            sortOrder: { setValue: (v: string) => void };
            creditCardId: { setValue: (v: string) => void };
          };
        };
      }
    ).filtersForm;
  }

  it('shows a removable chip for an active search filter and clears it on click', () => {
    filtersForm().controls.search.setValue('mercado');
    fixture.detectChanges();

    const chips = queryAll('.ep-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('mercado');

    chips[0].dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(queryAll('.ep-chip').length).toBe(0);
  });

  it('"Clear all" resets every active filter at once', () => {
    filtersForm().controls.search.setValue('mercado');
    filtersForm().controls.paymentStatus.setValue('OPEN');
    fixture.detectChanges();

    expect(queryAll('.ep-chip').length).toBe(2);

    query('.ep-chip-clear-all')!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(queryAll('.ep-chip').length).toBe(0);
    const c = component as unknown as { statusTabIndex: () => number };
    expect(c.statusTabIndex()).toBe(0);
  });

  it('shows no chips row when no filters are active', () => {
    expect(query('.ep-chips-row')).toBeNull();
  });

  // ── Empty state ──────────────────────────────────────────────────────────

  it('renders a designed empty state (not a blank screen) when filters produce zero results', () => {
    expenseService.expenses$.next([buildExpense({ id: 'e1', name: 'Groceries' })]);
    fixture.detectChanges();

    filtersForm().controls.search.setValue('no-such-expense-name');
    fixture.detectChanges();

    const empty = query('.ep-empty-state');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain('No expenses match filters');

    query('.ep-empty-clear-btn')!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(query('.ep-empty-state')).toBeNull();
    expect(query('.ew-table')).toBeTruthy();
  });

  it('renders the empty state at 0 items with no filters active', () => {
    expenseService.expenses$.next([]);
    fixture.detectChanges();

    expect(query('.ep-empty-state')).toBeTruthy();
  });

  // ── Day grouping: correctness at 0 / 1 / 500+ items, no O(n·m) lookups ──

  function dayGroups() {
    return (
      component as unknown as {
        dayGroups: () => readonly { date: string; items: readonly { id: string }[]; subtotal: number }[];
      }
    ).dayGroups();
  }

  it('dayGroups is empty when there are no expenses', () => {
    expenseService.expenses$.next([]);
    fixture.detectChanges();

    expect(dayGroups()).toEqual([]);
  });

  it('dayGroups produces a single group with the right subtotal for exactly 1 item', () => {
    expenseService.expenses$.next([buildExpense({ id: 'e1', purchaseDate: '2026-06-01', cost: 50, remaining: 50 })]);
    fixture.detectChanges();

    const groups = dayGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].date).toBe('2026-06-01');
    expect(groups[0].items.map((i) => i.id)).toEqual(['e1']);
    expect(groups[0].subtotal).toBe(50); // OPEN → uses remaining
  });

  it('dayGroups buckets by purchaseDate, sums subtotals correctly (OPEN uses remaining, PAID uses cost), and sorts groups DATE_DESC by default', () => {
    expenseService.expenses$.next([
      buildExpense({ id: 'e1', purchaseDate: '2026-06-01', cost: 100, remaining: 40 }), // OPEN, subtotal uses 40
      buildExpense({ id: 'e2', purchaseDate: '2026-06-01', cost: 20, remaining: 0 }), // PAID, subtotal uses 20
      buildExpense({ id: 'e3', purchaseDate: '2026-06-03', cost: 15, remaining: 15 }), // OPEN
    ]);
    fixture.detectChanges();

    const groups = dayGroups();
    expect(groups.map((g) => g.date)).toEqual(['2026-06-03', '2026-06-01']); // DATE_DESC
    const juneFirst = groups.find((g) => g.date === '2026-06-01')!;
    expect(juneFirst.items.length).toBe(2);
    expect(juneFirst.subtotal).toBe(60); // 40 + 20
  });

  it('dayGroups handles 500 expenses across many dates correctly and without a perf cliff (O(n) bucketing)', () => {
    const days = 25;
    const perDay = 20;
    const expenses = Array.from({ length: days * perDay }, (_, i) => {
      const day = String((i % days) + 1).padStart(2, '0');
      return buildExpense({
        id: `e${i}`,
        purchaseDate: `2026-01-${day}`,
        cost: 10,
        remaining: 10,
      });
    });
    expenseService.expenses$.next(expenses);

    const start = performance.now();
    fixture.detectChanges();
    const groups = dayGroups();
    const elapsedMs = performance.now() - start;

    expect(groups.length).toBe(days);
    expect(groups.reduce((acc, g) => acc + g.items.length, 0)).toBe(days * perDay);
    // Every group of 10 same-cost OPEN items sums to 100.
    expect(groups.every((g) => g.subtotal === perDay * 10)).toBe(true);
    // Not a strict perf assertion (CI variance), just a smoke check against an O(n·m) cliff.
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('renders 500+ grouped rows in the template without error when the By-day layout is active', () => {
    const expenses = Array.from({ length: 500 }, (_, i) =>
      buildExpense({ id: `e${i}`, purchaseDate: `2026-02-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    expenseService.expenses$.next(expenses);
    fixture.detectChanges();

    const byDayTab = queryAll('.ep-layout-tab').find((b) => b.textContent?.trim() === 'By day')!;
    byDayTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(queryAll('.ep-day-row').length).toBe(500);
  });

  // ── Accessibility fixes (code review) ───────────────────────────────────

  it('layout and status filter buttons use aria-pressed, not the tablist/tab APG pattern (no tabpanel exists)', () => {
    expect(query('[role="tablist"]')).toBeNull();
    expect(query('[role="tab"]')).toBeNull();

    const tableTab = queryAll('.ep-layout-tab').find((b) => b.textContent?.trim() === 'Table')!;
    const byDayTab = queryAll('.ep-layout-tab').find((b) => b.textContent?.trim() === 'By day')!;
    expect(tableTab.getAttribute('aria-pressed')).toBe('true');
    expect(byDayTab.getAttribute('aria-pressed')).toBe('false');

    byDayTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(tableTab.getAttribute('aria-pressed')).toBe('false');
    expect(byDayTab.getAttribute('aria-pressed')).toBe('true');

    const allTab = queryAll('.ep-status-tab').find((b) => b.textContent?.trim() === 'All')!;
    expect(allTab.getAttribute('aria-pressed')).toBe('true');
  });

  // D9: the inline `.ep-filters` panel (search/card/status/sort/date-range/hidden) was
  // replaced by a "Filters" button that opens `ExpenseFiltersDialogComponent` as a 544px
  // modal — the value-sort-disabled-while-grouped behavior these two tests used to assert
  // against the inline `<select>` now lives entirely in that component and is covered by
  // its own spec (`expense-filters-dialog.component.spec.ts`). What stays ExpensePage's
  // responsibility is wiring: the button renders, is enabled, and opens the dialog with
  // the live isGroupedLayout() accessor so the dialog can react to layout toggles itself.

  it('the Filters button opens the filters dialog with the live isGroupedLayout accessor', () => {
    const dialog = TestBed.inject(MatDialog) as unknown as { open: ReturnType<typeof vi.fn> };
    const filtersBtn = query('.ep-filters-btn') as HTMLButtonElement;
    expect(filtersBtn).toBeTruthy();

    filtersBtn.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    const [, config] = dialog.open.mock.calls[0] as [unknown, { data: { isGroupedLayout: () => boolean } }];
    expect(config.data.isGroupedLayout()).toBe(false);

    const byDayTab = queryAll('.ep-layout-tab').find((b) => b.textContent?.trim() === 'By day')!;
    byDayTab.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    // Same accessor reference — reflects the layout toggle without a second dialog.open call.
    expect(config.data.isGroupedLayout()).toBe(true);
  });

  it('the Filters button shows an active-count badge once a filter chip is present', () => {
    expect(query('.ep-filters-count')).toBeNull();

    filtersForm().controls.creditCardId.setValue('card-1');
    fixture.detectChanges();

    expect(query('.ep-filters-count')?.textContent?.trim()).toBe('1');
  });

  // D9 code review Major-2: the delete dialog is the one modal in this epic that disables
  // Escape/backdrop-click, since it's the only destructive/irreversible action — asserted
  // here so a future edit can't silently drop it back to Material's plain default.
  it('onDeleteClick opens the delete dialog with disableClose: true (the one destructive-action exception)', () => {
    expenseService.expenses$.next([buildExpense({ id: 'e1', name: 'Mercado' })]);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog) as unknown as { open: ReturnType<typeof vi.fn> };
    const deleteBtn = query('.ep-icon-btn--danger') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    deleteBtn.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    const [, config] = dialog.open.mock.calls[0] as [unknown, { disableClose?: boolean }];
    expect(config.disableClose).toBe(true);
  });

  it('the card filter chip resolves its label from the shared creditCardNameById Map (O(1), not a fresh .find() scan)', () => {
    const installmentService = TestBed.inject(InstallmentService) as unknown as {
      creditCards$: BehaviorSubject<readonly { id: string; name: string }[]>;
    };
    installmentService.creditCards$.next([{ id: 'card-9', name: 'Nubank Platinum' }]);
    fixture.detectChanges();

    filtersForm().controls.creditCardId.setValue('card-9');
    fixture.detectChanges();

    const chips = queryAll('.ep-chip');
    expect(chips.some((c) => c.textContent?.includes('Nubank Platinum'))).toBe(true);
  });

  it('moving focus after chip removal: focuses the next remaining chip', () => {
    filtersForm().controls.search.setValue('a');
    filtersForm().controls.paymentStatus.setValue('OPEN');
    fixture.detectChanges();

    const chips = queryAll<HTMLButtonElement>('.ep-chip');
    expect(chips.length).toBe(2);

    chips[0].dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const remaining = queryAll<HTMLButtonElement>('.ep-chip');
    expect(remaining.length).toBe(1);
    expect(document.activeElement).toBe(remaining[0]);
  });

  it('moving focus after removing the last chip: focuses "Clear all" if present, else the search input', () => {
    filtersForm().controls.search.setValue('a');
    fixture.detectChanges();

    const chips = queryAll<HTMLButtonElement>('.ep-chip');
    expect(chips.length).toBe(1);

    chips[0].dispatchEvent(new Event('click'));
    fixture.detectChanges();

    // No filters remain, so the whole chips row (including Clear all) unmounts —
    // focus must fall back to the search input rather than being dropped to <body>.
    expect(query('.ep-chips-row')).toBeNull();
    expect(document.activeElement).toBe(query('.ep-search-input'));
  });

  it('announces the removed filter via LiveAnnouncer (polite)', () => {
    filtersForm().controls.search.setValue('groceries');
    fixture.detectChanges();

    const announcer = TestBed.inject(LiveAnnouncer);
    const announceSpy = vi.spyOn(announcer, 'announce');

    query<HTMLButtonElement>('.ep-chip')!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('groceries'), 'polite');
  });

});
