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
    // Exact count, not just "was called" — this is the assertion that would have caught
    // the double-fetch bug (setViewMode + the constructor effect both calling
    // loadByWalletId on first visit) that a plain toHaveBeenCalledWith missed.
    expect(tagAccumulationService.loadByWalletId).toHaveBeenCalledTimes(1);
    expect(tagAccumulationService.loadByWalletId).toHaveBeenCalledWith('wallet-1');

    tagAccumulationService.loadByWalletId.mockClear();
    setViewMode('tags');
    setViewMode('accumulation');

    // Second visit does not trigger another load (already visited).
    expect(tagAccumulationService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('does not fire a second request when switching to the Acúmulos tab with no wallet selected', () => {
    // No wallet selected at all — setViewMode still flips accumulationVisited, but neither
    // it nor the constructor effect has a walletId to load with.
    setViewMode('accumulation');

    expect(tagAccumulationService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('reloads accumulation on wallet change once the tab has been visited', () => {
    walletService.selectedWallet$.next({ id: 'wallet-1' } as Wallet);
    fixture.detectChanges();

    setViewMode('accumulation');
    tagAccumulationService.loadByWalletId.mockClear();

    walletService.selectedWallet$.next({ id: 'wallet-2' } as Wallet);
    fixture.detectChanges();

    expect(tagAccumulationService.loadByWalletId).toHaveBeenCalledTimes(1);
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

  it('groups a subtag directly under its parent, regardless of source order', () => {
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        // sub-1 (for root-1) appears BEFORE root-1 itself in the source data — the subtag
        // must still be grouped right after its parent in the output, not left in place.
        { tagId: 'sub-1', tagName: 'Restaurants', parentId: 'root-1', total: 40, breakdown: { EXPENSE: 40 } },
        { tagId: 'root-2', tagName: 'Transport', parentId: null, total: 200, breakdown: { EXPENSE: 200 } },
        { tagId: 'root-1', tagName: 'Food', parentId: null, total: 60, breakdown: { EXPENSE: 60 } },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as {
        accumulationRows: () => readonly { tagId: string; isSubtag: boolean }[];
      }
    ).accumulationRows();

    // Roots keep the entries' relative order (root-2 before root-1, matching source);
    // sub-1 is pulled out of its original position and placed right after root-1.
    expect(rows.map((r) => r.tagId)).toEqual(['root-2', 'root-1', 'sub-1']);
    expect(rows.find((r) => r.tagId === 'sub-1')?.isSubtag).toBe(true);
    expect(rows.find((r) => r.tagId === 'root-1')?.isSubtag).toBe(false);
  });

  it('still shows a subtag whose parent has no accumulation entry of its own', () => {
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      // root-1 (the parent) never appears — it had zero contributions across all origins.
      entries: [
        { tagId: 'sub-1', tagName: 'Restaurants', parentId: 'root-1', total: 40, breakdown: { EXPENSE: 40 } },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as { accumulationRows: () => readonly { tagId: string }[] }
    ).accumulationRows();

    expect(rows.map((r) => r.tagId)).toEqual(['sub-1']);
  });
});
