import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';

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
// Task 3 splits the ledger into two sources: walletShares$ (GET /wallets/{id}/shares,
// backend-filtered to ACTIVE + effective-for-month, all 3 source types since backend
// commit 644cfca) feeds the "effective" slice of the Active tab, while shares$
// (owner-scoped, unfiltered) feeds both the "stopped" slice of Active (shares the
// wallet-scoped endpoint omits because they're not effective) and all of History.
// The sourceLabel fallback chain (Task 2) still keys off shares$, unchanged from before.
// The create-share form (sourceOptions, quota validation, etc.) moved to
// ShareFormComponent in Task 4 — its tests live in share-form.component.spec.ts now.

class FakeShareService {
  readonly shares$ = new BehaviorSubject<readonly Share[]>([]);
  readonly walletShares$ = new BehaviorSubject<readonly Share[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly reverting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  readonly walletSharesLoading$ = new BehaviorSubject(false);
  readonly walletSharesError$ = new BehaviorSubject<string | null>(null);
  loadAll = vi.fn();
  loadByWalletId = vi.fn();
  revert = vi.fn(() => of(undefined));
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

describe('SharePage', () => {
  let fixture: ComponentFixture<SharePage>;
  let component: SharePage;
  let shareService: FakeShareService;
  let expenseService: FakeExpenseService;
  let walletService: FakeWalletService;
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    shareService = new FakeShareService();
    expenseService = new FakeExpenseService();
    walletService = new FakeWalletService();
    dialog = { open: vi.fn() };

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
        { provide: MatDialog, useValue: dialog },
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

  type ListItem = { id: string; sourceLabel: string; active: boolean; stopped: boolean; totalAmount: number };

  function activeShareItems(): readonly ListItem[] {
    return (component as unknown as { activeShareItems: () => readonly ListItem[] }).activeShareItems();
  }

  function revertedShareItems(): readonly ListItem[] {
    return (component as unknown as { revertedShareItems: () => readonly ListItem[] }).revertedShareItems();
  }

  function visibleShareItems(): readonly ListItem[] {
    return (component as unknown as { visibleShareItems: () => readonly ListItem[] }).visibleShareItems();
  }

  function setView(view: 'active' | 'history'): void {
    (component as unknown as { shareView: { set: (v: 'active' | 'history') => void } }).shareView.set(view);
    fixture.detectChanges();
  }

  describe('shareView default and tab switching', () => {
    it('defaults to the active view', () => {
      expect((component as unknown as { shareView: () => string }).shareView()).toBe('active');
    });

    it('visibleShareItems reflects the active composition by default', () => {
      shareService.walletShares$.next([buildShare({ id: 'w-effective' })]);
      selectWallet('wallet-1');

      expect(visibleShareItems().map((s) => s.id)).toEqual(['w-effective']);
    });

    it('switching to history shows only REVERTED shares from shares$', () => {
      shareService.walletShares$.next([buildShare({ id: 'w-effective' })]);
      shareService.shares$.next([
        buildShare({ id: 's-reverted', walletId: 'wallet-1', status: 'REVERTED' }),
      ]);
      selectWallet('wallet-1');

      setView('history');

      expect(visibleShareItems().map((s) => s.id)).toEqual(['s-reverted']);
    });
  });

  describe('activeShareItems (effective + stopped composition)', () => {
    it('includes shares returned by walletShares$ as effective, without re-filtering by status', () => {
      shareService.walletShares$.next([buildShare({ id: 'w-1', status: 'ACTIVE' })]);
      selectWallet('wallet-1');

      expect(activeShareItems().map((s) => s.id)).toContain('w-1');
    });

    it('regression guard: an EXPENSE-sourced share returned by walletShares$ appears in the Active tab', () => {
      // Backend commit 644cfca (Task 6 of backend-tasks.md) fixed FindWalletSharesUseCase
      // to include EXPENSE shares — previously it silently excluded them, which would have
      // hidden every share created via InteractiveShareDialog (the app's most-used sharing
      // entry point) from this tab. If that endpoint regresses and excludes EXPENSE again,
      // this test fails here instead of a user discovering it in production.
      shareService.walletShares$.next([
        buildShare({ id: 'w-expense', sourceType: 'EXPENSE', status: 'ACTIVE' }),
      ]);
      selectWallet('wallet-1');

      expect(activeShareItems().map((s) => s.id)).toContain('w-expense');
    });

    it('includes a stopped share (ACTIVE with stoppedFromMonth) that only exists in shares$', () => {
      // walletShares$ omits it — isEffectiveFor(month) filters it out server-side, by
      // definition, because it's not effective for the wallet's current month. It must
      // still surface here so it doesn't vanish from the screen while still valid for
      // past months (achado nº 1b — the "limbo" this task exists to close).
      shareService.walletShares$.next([]);
      shareService.shares$.next([
        buildShare({
          id: 's-stopped',
          walletId: 'wallet-1',
          status: 'ACTIVE',
          stoppedFromMonth: '2026-06',
        }),
      ]);
      selectWallet('wallet-1');

      expect(activeShareItems().map((s) => s.id)).toContain('s-stopped');
    });

    it('marks a stopped share as stopped: true', () => {
      shareService.shares$.next([
        buildShare({ id: 's-stopped', walletId: 'wallet-1', status: 'ACTIVE', stoppedFromMonth: '2026-06' }),
      ]);
      selectWallet('wallet-1');

      const item = activeShareItems().find((s) => s.id === 's-stopped');
      expect(item?.stopped).toBe(true);
      expect(item?.active).toBe(true); // still ACTIVE — revert must remain available
    });

    it('a non-stopped effective share is not marked as stopped', () => {
      shareService.walletShares$.next([buildShare({ id: 'w-1', stoppedFromMonth: null })]);
      selectWallet('wallet-1');

      expect(activeShareItems().find((s) => s.id === 'w-1')?.stopped).toBe(false);
    });

    it('dedupes by id: a share with a FUTURE stoppedFromMonth is still effective and would ' +
      'otherwise match both sources — the wallet-scoped item wins and it appears once', () => {
      // isEffectiveFor(month) = status === ACTIVE && (stoppedFromMonth == null ||
      // walletMonth.isBefore(stoppedFromMonth)). A future stoppedFromMonth means the share
      // IS effective (so walletShares$ returns it), while the client-side "stopped" check
      // here is just `stoppedFromMonth !== null` (not the full month comparison) — so the
      // same id also matches the stopped-shares recruit from shares$. Without dedupe this
      // would render twice.
      const futureStopped = buildShare({
        id: 'share-future-stop',
        walletId: 'wallet-1',
        status: 'ACTIVE',
        stoppedFromMonth: '2099-01',
      });
      shareService.walletShares$.next([futureStopped]);
      shareService.shares$.next([futureStopped]);
      selectWallet('wallet-1');

      const matches = activeShareItems().filter((s) => s.id === 'share-future-stop');
      expect(matches).toHaveLength(1);
    });

    it('an ACTIVE stopped share from another wallet does not leak into the Active tab', () => {
      shareService.shares$.next([
        buildShare({ id: 's-other-wallet', walletId: 'wallet-2', status: 'ACTIVE', stoppedFromMonth: '2026-06' }),
      ]);
      selectWallet('wallet-1');

      expect(activeShareItems().map((s) => s.id)).not.toContain('s-other-wallet');
    });
  });

  describe('revertedShareItems (History tab)', () => {
    it('scopes shares$ (owner-scoped, unfiltered) to the selected wallet + REVERTED status', () => {
      shareService.shares$.next([
        buildShare({ id: 's-here', walletId: 'wallet-1', status: 'REVERTED' }),
        buildShare({ id: 's-other-wallet', walletId: 'wallet-2', status: 'REVERTED' }),
        buildShare({ id: 's-active', walletId: 'wallet-1', status: 'ACTIVE' }),
      ]);
      selectWallet('wallet-1');

      expect(revertedShareItems().map((s) => s.id)).toEqual(['s-here']);
    });

    it('a REVERTED share from another wallet does not leak into History', () => {
      shareService.shares$.next([
        buildShare({ id: 's-other-wallet', walletId: 'wallet-2', status: 'REVERTED' }),
      ]);
      selectWallet('wallet-1');

      expect(revertedShareItems().map((s) => s.id)).not.toContain('s-other-wallet');
    });
  });

  describe('counts and sharedTotal', () => {
    it('activeShareCount matches the size of activeShareItems (effective + stopped)', () => {
      shareService.walletShares$.next([buildShare({ id: 'w-1' })]);
      shareService.shares$.next([
        buildShare({ id: 's-stopped', walletId: 'wallet-1', status: 'ACTIVE', stoppedFromMonth: '2026-06' }),
      ]);
      selectWallet('wallet-1');

      const activeShareCount = (component as unknown as { activeShareCount: () => number }).activeShareCount();
      expect(activeShareCount).toBe(activeShareItems().length);
      expect(activeShareCount).toBe(2);
    });

    it('revertedShareCount matches the size of revertedShareItems', () => {
      shareService.shares$.next([
        buildShare({ id: 's-1', walletId: 'wallet-1', status: 'REVERTED' }),
        buildShare({ id: 's-2', walletId: 'wallet-1', status: 'REVERTED' }),
      ]);
      selectWallet('wallet-1');

      const revertedShareCount = (component as unknown as { revertedShareCount: () => number }).revertedShareCount();
      expect(revertedShareCount).toBe(2);
    });

    it('sharedTotal sums only active shares (effective + stopped), not reverted ones', () => {
      // Pre-existing bug fix: this used to sum shareItems() (ACTIVE + REVERTED together),
      // which double-counted amounts that no longer affect the ledger. Now it must sum
      // only what the Active tab shows.
      shareService.walletShares$.next([buildShare({ id: 'w-1', totalAmount: 100 })]);
      shareService.shares$.next([
        buildShare({ id: 's-stopped', walletId: 'wallet-1', status: 'ACTIVE', stoppedFromMonth: '2026-06', totalAmount: 50 }),
        buildShare({ id: 's-reverted', walletId: 'wallet-1', status: 'REVERTED', totalAmount: 999 }),
      ]);
      selectWallet('wallet-1');

      const sharedTotal = (component as unknown as { sharedTotal: () => number }).sharedTotal();
      expect(sharedTotal).toBe(150);
    });
  });

  describe('wallet change loads both share sources', () => {
    it('calls both loadAll() and loadByWalletId() on wallet selection', () => {
      selectWallet('wallet-1');

      expect(shareService.loadAll).toHaveBeenCalled();
      expect(shareService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    });
  });

  describe('openCreateShareDialog', () => {
    it('reloads walletShares$ for the selected wallet when the dialog closes with a created share', () => {
      selectWallet('wallet-1');
      shareService.loadByWalletId.mockClear();
      const afterClosed = new Subject<Share | undefined>();
      dialog.open.mockReturnValue({ afterClosed: () => afterClosed.asObservable() });

      (component as unknown as { openCreateShareDialog: () => void }).openCreateShareDialog();
      afterClosed.next(buildShare({ id: 'new-share' }));

      expect(shareService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    });

    it('does not reload when the dialog closes without a result (Cancel)', () => {
      selectWallet('wallet-1');
      shareService.loadByWalletId.mockClear();
      const afterClosed = new Subject<Share | undefined>();
      dialog.open.mockReturnValue({ afterClosed: () => afterClosed.asObservable() });

      (component as unknown as { openCreateShareDialog: () => void }).openCreateShareDialog();
      afterClosed.next(undefined);

      expect(shareService.loadByWalletId).not.toHaveBeenCalled();
    });
  });

  describe('revertShare', () => {
    it('reloads walletShares$ (via loadByWalletId) after a successful revert, in addition to ' +
      'the loadAll() ShareService.revert() already triggers internally', () => {
      selectWallet('wallet-1');
      shareService.loadByWalletId.mockClear();

      (component as unknown as { revertShare: (id: string) => void }).revertShare('share-1');

      expect(shareService.revert).toHaveBeenCalledWith('share-1');
      expect(shareService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    });

    it('reloads the CURRENTLY selected wallet, not the one selected when revert() was called — ' +
      'guards against a stale walletId if the user switches wallets while the revert is in flight', () => {
      // Self-review finding: walletId must be read inside the next() callback, not captured
      // in a closure before the async revert() resolves. Simulate an in-flight revert with a
      // manually-controlled Subject so the wallet switch can happen before it completes.
      const revertResult = new Subject<undefined>();
      shareService.revert.mockReturnValue(revertResult);
      selectWallet('wallet-1');
      shareService.loadByWalletId.mockClear();

      (component as unknown as { revertShare: (id: string) => void }).revertShare('share-1');
      expect(shareService.loadByWalletId).not.toHaveBeenCalled(); // still in flight

      selectWallet('wallet-2'); // user switches wallets before the revert resolves
      shareService.loadByWalletId.mockClear(); // clear the call the wallet-change effect just made

      revertResult.next(undefined);
      revertResult.complete();

      expect(shareService.loadByWalletId).toHaveBeenCalledWith('wallet-2');
      expect(shareService.loadByWalletId).not.toHaveBeenCalledWith('wallet-1');
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
      shareService.walletShares$.next([
        buildShare({ sourceType: 'EXPENSE', sourceId: 'expense-elsewhere', sourceName: 'Aluguel' }),
      ]);
      fixture.detectChanges();

      expect(activeShareItems()[0].sourceLabel).toBe('Aluguel');
    });

    it('falls back to the local list lookup when sourceName is null but the source is loaded locally', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', name: 'Groceries' })]);
      shareService.walletShares$.next([
        buildShare({ sourceType: 'EXPENSE', sourceId: 'expense-1', sourceName: null }),
      ]);
      fixture.detectChanges();

      expect(activeShareItems()[0].sourceLabel).toBe('Groceries');
    });

    it('falls back to the raw id slice as a last resort when sourceName is null and the source is not loaded locally', () => {
      expenseService.expenses$.next([]);
      shareService.walletShares$.next([
        buildShare({ sourceType: 'EXPENSE', sourceId: 'expense-nowhere-12345', sourceName: null }),
      ]);
      fixture.detectChanges();

      expect(activeShareItems()[0].sourceLabel).toBe('expense-nowhere-12345'.slice(0, 8));
    });
  });
});
