import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';

import { PayerService } from '@features/payer/services/payer.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { ShareService } from '@features/share/services/share.service';
import { Payer } from '@features/payer/models/payer';
import { Wallet } from '@features/wallet/models/wallet';
import { Share } from '@features/share/models/share';

import { PayerPage, shareBadgeState } from './payer-page';

// ── Task 6 (improvement-shares/frontend-tasks.md): activeShareAmount badge ──────
// Conditional rendering — Victor's decision (2026-07-26), prevails over the design
// brief: activeShareAmount and amountDue are identical by construction today (same
// server-side source, PayerAmountDue.monthly()), so the badge must never repeat the
// same number twice.

function makePayer(overrides: Partial<Payer> = {}): Payer {
  return {
    id: 'payer-1',
    name: 'Alice',
    type: 'STANDING',
    walletId: 'wallet-1',
    subscriptionId: null,
    paymentDate: '2026-05-01',
    amountDue: 100,
    activeShareAmount: 100,
    currency: 'BRL',
    deleted: false,
    ...overrides,
  };
}

function buildShare(overrides: Partial<Share> = {}): Share {
  return {
    id: 'share-1',
    walletId: 'wallet-1',
    sourceType: 'EXPENSE',
    sourceId: 'expense-1',
    sourceName: 'Supermarket run',
    totalAmount: 100,
    ownerShare: 70,
    ownerRatio: 0.7,
    currency: 'BRL',
    status: 'ACTIVE',
    // amount (journey/total) deliberately differs from monthlyAmount (periodic) in this
    // fixture's default — regression guard for the bug Victor found: the Obligations
    // panel must render monthlyAmount, not amount. If a future edit reverts
    // obligationRows() to read quota.amount, these tests should fail loudly.
    quotas: [
      { payerId: 'payer-1', payerName: 'Alice', ratio: 0.3, amount: 300, monthlyAmount: 30, paymentIds: [] },
    ],
    paymentIds: [],
    createdAt: '2026-06-01T10:00:00Z',
    revertedAt: null,
    stoppedFromMonth: null,
    ...overrides,
  };
}

class FakePayerService {
  readonly payers$ = new BehaviorSubject<readonly Payer[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadByWalletId = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
}

class FakeShareService {
  readonly walletShares$ = new BehaviorSubject<readonly Share[]>([]);
  loadByWalletId = vi.fn();
}

describe('shareBadgeState (pure helper)', () => {
  it('returns "none" when activeShareAmount is zero', () => {
    expect(shareBadgeState(0, 100)).toEqual({ kind: 'none' });
  });

  it('returns "all" when activeShareAmount equals amountDue', () => {
    expect(shareBadgeState(100, 100)).toEqual({ kind: 'all' });
  });

  it('returns "partial" with the amount when activeShareAmount diverges from amountDue', () => {
    expect(shareBadgeState(40, 100)).toEqual({ kind: 'partial', amount: 40 });
  });
});

describe('PayerPage — activeShareAmount badge', () => {
  let fixture: ComponentFixture<PayerPage>;
  let component: PayerPage;
  let payerService: FakePayerService;
  let walletService: FakeWalletService;
  let shareService: FakeShareService;

  beforeEach(() => {
    payerService = new FakePayerService();
    walletService = new FakeWalletService();
    shareService = new FakeShareService();

    TestBed.configureTestingModule({
      imports: [PayerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PayerService, useValue: payerService },
        { provide: WalletService, useValue: walletService },
        { provide: ShareService, useValue: shareService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(PayerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders no badge in the list row for a payer with no active share', () => {
    payerService.payers$.next([makePayer({ activeShareAmount: 0 })]);
    fixture.detectChanges();

    const badge: HTMLElement | null = fixture.nativeElement.querySelector(
      '.payer-alloc-nums .pc-share-badge',
    );
    expect(badge).toBeNull();
  });

  it('renders the qualifier label without repeating the value when activeShareAmount equals amountDue', () => {
    payerService.payers$.next([makePayer({ amountDue: 250, activeShareAmount: 250 })]);
    fixture.detectChanges();

    const badge: HTMLElement | null = fixture.nativeElement.querySelector(
      '.payer-alloc-nums .pc-share-badge',
    );
    expect(badge?.textContent?.trim()).toBe('all from active shares');
  });

  it('renders the full badge with the value when activeShareAmount diverges from amountDue', () => {
    payerService.payers$.next([makePayer({ amountDue: 250, activeShareAmount: 100 })]);
    fixture.detectChanges();

    const badge: HTMLElement | null = fixture.nativeElement.querySelector(
      '.payer-alloc-nums .pc-share-badge',
    );
    expect(badge?.textContent).toContain('from active shares');
    expect(badge?.textContent).toContain('100');
  });

  it('exposes the same conditional badge on the selector-strip card', () => {
    payerService.payers$.next([makePayer({ amountDue: 250, activeShareAmount: 250 })]);
    fixture.detectChanges();

    const badge: HTMLElement | null = fixture.nativeElement.querySelector(
      '.payer-card .pc-share-badge',
    );
    expect(badge?.textContent?.trim()).toBe('all from active shares');
  });
});

// ── Task 10 (improvement-shares/frontend-tasks.md): Obligations panel ────────────
// Share-by-share decomposition of the activeShareAmount badge (Task 6).

describe('PayerPage — Obligations panel (Task 10)', () => {
  let fixture: ComponentFixture<PayerPage>;
  let component: PayerPage;
  let payerService: FakePayerService;
  let walletService: FakeWalletService;
  let shareService: FakeShareService;

  interface Row {
    readonly payerId: string;
    readonly payerName: string;
    readonly sourceLabel: string;
    readonly amount: number;
  }

  function obligationRows(): readonly Row[] {
    return (component as unknown as { obligationRows: () => readonly Row[] }).obligationRows();
  }

  function filteredObligationRows(): readonly Row[] {
    return (
      component as unknown as { filteredObligationRows: () => readonly Row[] }
    ).filteredObligationRows();
  }

  function selectPayer(id: string | null): void {
    (component as unknown as { selectPayer: (id: string | null) => void }).selectPayer(id);
  }

  // Intl.NumberFormat('pt-BR', { style: 'currency' }) (BrlCurrencyPipe) renders the
  // R$/amount gap as U+00A0 (non-breaking space), not a regular space — normalize so
  // assertions can use an ordinary space without depending on that detail.
  function rowTexts(): string[][] {
    const rows: HTMLTableRowElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.ew-panel table tbody tr'),
    );
    return rows.map((row) =>
      Array.from(row.querySelectorAll('td')).map(
        (cell) => (cell.textContent ?? '').replace(/\u00A0/g, ' ').trim(),
      ),
    );
  }

  beforeEach(() => {
    payerService = new FakePayerService();
    walletService = new FakeWalletService();
    shareService = new FakeShareService();

    TestBed.configureTestingModule({
      imports: [PayerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PayerService, useValue: payerService },
        { provide: WalletService, useValue: walletService },
        { provide: ShareService, useValue: shareService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(PayerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    walletService.selectedWallet$.next({
      id: 'wallet-1',
      description: 'Main',
      budget: 1000,
      remaining: 500,
      startDate: '2026-06-01',
      closedDate: null,
      closed: false,
      effectiveMonth: '2026-06',
      state: 'PRODUCTION',
    });
    payerService.payers$.next([
      makePayer({ id: 'payer-1', name: 'Alice', walletId: 'wallet-1' }),
      makePayer({ id: 'payer-2', name: 'Bob', walletId: 'wallet-1' }),
    ]);
    fixture.detectChanges();
  });

  it('loads shares via ShareService.loadByWalletId(selectedWalletId) on init', () => {
    expect(shareService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
  });

  it('lists one row per quota of a share returned by walletShares$', () => {
    shareService.walletShares$.next([
      buildShare({
        id: 'share-1',
        walletId: 'wallet-1',
        sourceName: 'Supermarket run',
        sourceType: 'EXPENSE',
        quotas: [
          { payerId: 'payer-1', payerName: 'Alice', ratio: 0.3, amount: 300, monthlyAmount: 30, paymentIds: [] },
        ],
      }),
    ]);
    fixture.detectChanges();

    expect(filteredObligationRows().length).toBe(1);
    expect(rowTexts()).toEqual([['Alice', 'Supermarket run', 'Expense', '01/06/2026', 'R$ 30,00']]);
  });

  it('sums to the same total as the payer activeShareAmount badge decomposes (2 quotas)', () => {
    shareService.walletShares$.next([
      buildShare({
        id: 'share-1',
        walletId: 'wallet-1',
        quotas: [
          { payerId: 'payer-1', payerName: 'Alice', ratio: 0.2, amount: 200, monthlyAmount: 20, paymentIds: [] },
          { payerId: 'payer-2', payerName: 'Bob', ratio: 0.1, amount: 100, monthlyAmount: 10, paymentIds: [] },
        ],
      }),
    ]);
    fixture.detectChanges();

    const total = obligationRows()
      .filter((row) => row.payerId === 'payer-1')
      .reduce((sum, row) => sum + row.amount, 0);
    expect(total).toBe(20);
  });

  it('uses quota.monthlyAmount, not quota.amount, for the rendered/decomposed value', () => {
    shareService.walletShares$.next([
      buildShare({
        id: 'share-1',
        walletId: 'wallet-1',
        quotas: [
          { payerId: 'payer-1', payerName: 'Alice', ratio: 0.3, amount: 999, monthlyAmount: 30, paymentIds: [] },
        ],
      }),
    ]);
    fixture.detectChanges();

    expect(obligationRows()[0]?.amount).toBe(30);
    expect(rowTexts()[0]?.[4]).toBe('R$ 30,00');
  });

  it('renders no rows and the empty state when walletShares$ is empty', () => {
    shareService.walletShares$.next([]);
    fixture.detectChanges();

    expect(obligationRows().length).toBe(0);
    const empty: HTMLElement | null = fixture.nativeElement.querySelector('.ew-empty');
    expect(empty?.textContent).toContain('No active shares');
  });

  /**
   * Guard against re-introducing a client-side status/wallet filter (see obligationRows'
   * doc): walletShares$ is already scoped to the selected wallet + ACTIVE + effective by
   * the backend. If the panel had its own filter and that filter were later "simplified"
   * away, a real regression could slip by unnoticed. Feeding a REVERTED share here and
   * asserting it still renders documents that this component trusts the source outright,
   * matching SharePage's own rule for walletShares$ (Task 1/3) — it is not this
   * component's job to re-decide what counts as "active/effective".
   */
  it('trusts walletShares$ outright — renders whatever it emits without re-filtering', () => {
    shareService.walletShares$.next([
      buildShare({ id: 'share-x', walletId: 'wallet-1', status: 'REVERTED' }),
    ]);
    fixture.detectChanges();

    expect(obligationRows().length).toBe(1);
  });

  it('uses sourceName when present, falling back to the id slice when null', () => {
    shareService.walletShares$.next([
      buildShare({
        id: 'share-1',
        sourceId: 'abcdefgh-1111-2222-3333-444444444444',
        sourceName: null,
      }),
    ]);
    fixture.detectChanges();

    expect(obligationRows()[0]?.sourceLabel).toBe('abcdefgh');
  });

  it('does not render the literal string "null" when sourceName is null', () => {
    shareService.walletShares$.next([buildShare({ sourceName: null })]);
    fixture.detectChanges();

    const sourceCell = rowTexts()[0]?.[1];
    expect(sourceCell).not.toContain('null');
  });

  it('uses sourceType as the Type column label (no Manual/Share distinction)', () => {
    shareService.walletShares$.next([buildShare({ sourceType: 'INSTALLMENT' })]);
    fixture.detectChanges();

    expect(rowTexts()[0]?.[2]).toBe('Installment');
  });

  it('includes a transient quota (payerId with no matching Payer) under "All"', () => {
    shareService.walletShares$.next([
      buildShare({
        quotas: [
          { payerId: 'transient-xyz', payerName: 'Guest Diner', ratio: 1, amount: 300, monthlyAmount: 30, paymentIds: [] },
        ],
      }),
    ]);
    fixture.detectChanges();

    expect(filteredObligationRows().length).toBe(1);
    expect(filteredObligationRows()[0]?.payerName).toBe('Guest Diner');
  });

  it('excludes a transient quota row when a specific real payer is filtered', () => {
    shareService.walletShares$.next([
      buildShare({
        quotas: [
          { payerId: 'transient-xyz', payerName: 'Guest Diner', ratio: 1, amount: 300, monthlyAmount: 30, paymentIds: [] },
        ],
      }),
    ]);
    selectPayer('payer-1');
    fixture.detectChanges();

    expect(filteredObligationRows().length).toBe(0);
  });

  it('the dropdown filters rows to the selected payer', () => {
    shareService.walletShares$.next([
      buildShare({
        id: 'share-1',
        quotas: [
          { payerId: 'payer-1', payerName: 'Alice', ratio: 0.3, amount: 300, monthlyAmount: 30, paymentIds: [] },
        ],
      }),
      buildShare({
        id: 'share-2',
        sourceName: 'Netflix',
        quotas: [
          { payerId: 'payer-2', payerName: 'Bob', ratio: 0.5, amount: 500, monthlyAmount: 50, paymentIds: [] },
        ],
      }),
    ]);
    selectPayer('payer-2');
    fixture.detectChanges();

    expect(rowTexts()).toEqual([['Bob', 'Netflix', 'Expense', '01/06/2026', 'R$ 50,00']]);
  });

  it('"All" (default) shows rows for every payer', () => {
    shareService.walletShares$.next([
      buildShare({
        id: 'share-1',
        quotas: [
          { payerId: 'payer-1', payerName: 'Alice', ratio: 0.3, amount: 300, monthlyAmount: 30, paymentIds: [] },
        ],
      }),
      buildShare({
        id: 'share-2',
        quotas: [
          { payerId: 'payer-2', payerName: 'Bob', ratio: 0.5, amount: 500, monthlyAmount: 50, paymentIds: [] },
        ],
      }),
    ]);
    fixture.detectChanges();

    expect(filteredObligationRows().length).toBe(2);
  });

  it('ew-blur is applied only to the amount cell, not the whole row', () => {
    shareService.walletShares$.next([buildShare()]);
    fixture.detectChanges();

    const row: HTMLTableRowElement | null = fixture.nativeElement.querySelector(
      '.ew-panel table tbody tr',
    );
    expect(row?.classList.contains('ew-blur')).toBe(false);
    expect(row?.querySelector('td.ew-blur')).not.toBeNull();
    expect(row?.querySelectorAll('td:not(.ew-blur)').length).toBe(4);
  });
});
