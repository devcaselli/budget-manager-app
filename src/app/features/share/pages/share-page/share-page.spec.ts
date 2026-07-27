import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { ExpenseService } from '@features/expense/services/expense.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { ShareService } from '@features/share/services/share.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Expense } from '@features/expense/models/expense';
import { Share } from '@features/share/models/share';
import { Wallet } from '@features/wallet/models/wallet';
import { Payer } from '@features/payer/models/payer';

import { SharePage } from './share-page';

// ── Fakes ──────────────────────────────────────────────────────────────────
// The bugs under test live in SharePage's `shareItems` computed (client-side
// wallet filtering of the owner-scoped shares$) and `sourceOptions` (excluding
// expenses that already have an active share). Stub services so the test drives
// shares$ / expenses$ / selectedWallet$ directly, no HTTP.

class FakeShareService {
  readonly shares$ = new BehaviorSubject<readonly Share[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly reverting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadAll = vi.fn();
  revert = vi.fn();
}

class FakeExpenseService {
  readonly expenses$ = new BehaviorSubject<readonly Expense[]>([]);
  loadByWalletId = vi.fn();
}

class FakeInstallmentService {
  readonly allInstallments$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeSubscriptionService {
  readonly subscriptions$ = new BehaviorSubject<readonly unknown[]>([]);
  loadSubscriptions = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
  findPayersByWalletId(): Observable<Payer[]> {
    return of([]);
  }
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

describe('SharePage — client-side wallet filtering & source exclusion', () => {
  let fixture: ComponentFixture<SharePage>;
  let component: SharePage;
  let shareService: FakeShareService;
  let expenseService: FakeExpenseService;
  let walletService: FakeWalletService;

  beforeEach(() => {
    shareService = new FakeShareService();
    expenseService = new FakeExpenseService();
    walletService = new FakeWalletService();

    TestBed.configureTestingModule({
      imports: [SharePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShareService, useValue: shareService },
        { provide: ExpenseService, useValue: expenseService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: SubscriptionService, useClass: FakeSubscriptionService },
        { provide: WalletService, useValue: walletService },
      ],
    });

    fixture = TestBed.createComponent(SharePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function selectWallet(id: string): void {
    walletService.selectedWallet$.next({ id } as Wallet);
    fixture.detectChanges();
  }

  function shareItems() {
    return (component as unknown as { shareItems: () => readonly { id: string }[] }).shareItems();
  }

  function sourceOptions() {
    return (component as unknown as { sourceOptions: () => readonly { id: string }[] }).sourceOptions();
  }

  function shareItemsWithLabels() {
    return (
      component as unknown as { shareItems: () => readonly { id: string; sourceLabel: string }[] }
    ).shareItems();
  }

  describe('shareItems (wallet filter)', () => {
    it('returns no shares until a wallet is selected', () => {
      shareService.shares$.next([buildShare()]);
      fixture.detectChanges();

      expect(shareItems()).toEqual([]);
    });

    it('shows only shares whose walletId matches the selected wallet', () => {
      shareService.shares$.next([
        buildShare({ id: 's-here', walletId: 'wallet-1' }),
        buildShare({ id: 's-other', walletId: 'wallet-2' }),
      ]);
      selectWallet('wallet-1');

      const ids = shareItems().map((s) => s.id);
      expect(ids).toEqual(['s-here']);
    });

    it('includes both ACTIVE and REVERTED shares for the selected wallet', () => {
      shareService.shares$.next([
        buildShare({ id: 's-active', status: 'ACTIVE' }),
        buildShare({ id: 's-reverted', status: 'REVERTED' }),
      ]);
      selectWallet('wallet-1');

      expect(shareItems().map((s) => s.id).sort()).toEqual(['s-active', 's-reverted']);
    });
  });

  describe('sourceOptions (EXPENSE dropdown exclusion)', () => {
    beforeEach(() => selectWallet('wallet-1'));

    it('lists an expense that has no active share', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
      shareService.shares$.next([]);
      fixture.detectChanges();

      expect(sourceOptions().map((o) => o.id)).toContain('expense-1');
    });

    it('excludes an expense that already has an ACTIVE share', () => {
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1' }),
        buildExpense({ id: 'expense-2', name: 'Fuel' }),
      ]);
      shareService.shares$.next([buildShare({ sourceId: 'expense-1', status: 'ACTIVE' })]);
      fixture.detectChanges();

      const ids = sourceOptions().map((o) => o.id);
      expect(ids).not.toContain('expense-1');
      expect(ids).toContain('expense-2');
    });

    it('re-lists an expense once its share is REVERTED', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
      shareService.shares$.next([buildShare({ sourceId: 'expense-1', status: 'REVERTED' })]);
      fixture.detectChanges();

      expect(sourceOptions().map((o) => o.id)).toContain('expense-1');
    });
  });

  describe('sourceLabel fallback chain (Task 2)', () => {
    beforeEach(() => selectWallet('wallet-1'));

    it('uses share.sourceName directly, even when the source is not in any locally loaded list', () => {
      // This is the bug the Victor reported: a source belonging to another wallet/month
      // used to fall through to the raw-id fallback because the local expenses/installments/
      // subscriptions lists never had it loaded. With sourceName resolved server-side, the
      // label is correct regardless of what the client happens to have loaded locally.
      expenseService.expenses$.next([]); // source NOT in the local list
      shareService.shares$.next([
        buildShare({ sourceType: 'EXPENSE', sourceId: 'expense-elsewhere', sourceName: 'Aluguel' }),
      ]);
      fixture.detectChanges();

      expect(shareItemsWithLabels()[0].sourceLabel).toBe('Aluguel');
    });

    it('falls back to the local list lookup when sourceName is null but the source is loaded locally', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', name: 'Groceries' })]);
      shareService.shares$.next([
        buildShare({ sourceType: 'EXPENSE', sourceId: 'expense-1', sourceName: null }),
      ]);
      fixture.detectChanges();

      expect(shareItemsWithLabels()[0].sourceLabel).toBe('Groceries');
    });

    it('falls back to the raw id slice as a last resort when sourceName is null and the source is not loaded locally', () => {
      expenseService.expenses$.next([]);
      shareService.shares$.next([
        buildShare({ sourceType: 'EXPENSE', sourceId: 'expense-nowhere-12345', sourceName: null }),
      ]);
      fixture.detectChanges();

      expect(shareItemsWithLabels()[0].sourceLabel).toBe('expense-nowhere-12345'.slice(0, 8));
    });
  });
});
