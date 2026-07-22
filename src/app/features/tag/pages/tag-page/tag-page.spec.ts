import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';

import { TagService } from '@features/tag/services/tag.service';
import { TagAccumulationService } from '@features/tag/services/tag-accumulation.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Tag } from '@features/tag/models/tag';
import { TagAccumulation } from '@features/tag/models/tag-accumulation';
import { Wallet } from '@features/wallet/models/wallet';

import { TagPage } from './tag-page';

// ── Fakes ──────────────────────────────────────────────────────────────────
// The "Acúmulos" tab (moved here from Expenses per Victor's request, Tags Fase 2
// follow-up) is under test: lazy-load on first visit, reload on wallet change once
// visited, and the accumulation rows' formatted breakdown label.

class FakeTagService {
  readonly tags$ = new BehaviorSubject<readonly Tag[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadAll = vi.fn();
}

class FakeTagAccumulationService {
  readonly accumulation$ = new BehaviorSubject<TagAccumulation | null>(null);
  readonly loading$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadByWalletId = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
}

describe('TagPage — Acúmulos tab', () => {
  let fixture: ComponentFixture<TagPage>;
  let component: TagPage;
  let tagAccumulationService: FakeTagAccumulationService;
  let walletService: FakeWalletService;

  beforeEach(() => {
    tagAccumulationService = new FakeTagAccumulationService();
    walletService = new FakeWalletService();

    TestBed.configureTestingModule({
      imports: [TagPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TagService, useClass: FakeTagService },
        { provide: TagAccumulationService, useValue: tagAccumulationService },
        { provide: WalletService, useValue: walletService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(TagPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function setViewMode(mode: string): void {
    (component as unknown as { setViewMode: (m: string) => void }).setViewMode(mode);
    fixture.detectChanges();
  }

  it('defaults to the Tags view', () => {
    expect((component as unknown as { viewMode: () => string }).viewMode()).toBe('tags');
    expect(tagAccumulationService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('lazy-loads accumulation only on first switch to the Acúmulos tab', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    expect(tagAccumulationService.loadByWalletId).not.toHaveBeenCalled();

    setViewMode('accumulation');
    expect(tagAccumulationService.loadByWalletId).toHaveBeenCalledWith('wallet-1');

    tagAccumulationService.loadByWalletId.mockClear();
    setViewMode('tags');
    setViewMode('accumulation');

    // Second visit does not trigger another load (already visited).
    expect(tagAccumulationService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('reloads accumulation on wallet change once the tab has been visited', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    setViewMode('accumulation');
    tagAccumulationService.loadByWalletId.mockClear();

    walletService.selectedWallet$.next({ id: 'wallet-2' } as Wallet);
    fixture.detectChanges();

    expect(tagAccumulationService.loadByWalletId).toHaveBeenCalledWith('wallet-2');
  });

  it('does not reload accumulation on wallet change before the tab has ever been visited', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();
    walletService.selectedWallet$.next({ id: 'wallet-2' } as Wallet);
    fixture.detectChanges();

    expect(tagAccumulationService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('builds accumulation rows with a formatted breakdown label', () => {
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        {
          tagId: 'tag-1',
          tagName: 'Food',
          parentId: null,
          total: 1075,
          breakdown: { EXPENSE: 50, INSTALLMENT: 1000, SUBSCRIPTION: 25 },
        },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as {
        accumulationRows: () => readonly { tagName: string; total: number; breakdownLabel: string }[];
      }
    ).accumulationRows();

    expect(rows).toHaveLength(1);
    expect(rows[0].tagName).toBe('Food');
    expect(rows[0].total).toBe(1075);
    const nbsp = '\u00A0';
    expect(rows[0].breakdownLabel).toBe(
      `Expense: R$${nbsp}50,00 · Installment: R$${nbsp}1.000,00 · Subscription: R$${nbsp}25,00`,
    );
  });

  it('returns an empty array when no accumulation has loaded yet', () => {
    const rows = (component as unknown as { accumulationRows: () => readonly unknown[] }).accumulationRows();
    expect(rows).toEqual([]);
  });
});
