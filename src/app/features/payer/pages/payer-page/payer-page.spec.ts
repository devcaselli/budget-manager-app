import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';

import { PayerService } from '@features/payer/services/payer.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Payer } from '@features/payer/models/payer';
import { Wallet } from '@features/wallet/models/wallet';

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

  beforeEach(() => {
    payerService = new FakePayerService();
    walletService = new FakeWalletService();

    TestBed.configureTestingModule({
      imports: [PayerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PayerService, useValue: payerService },
        { provide: WalletService, useValue: walletService },
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
