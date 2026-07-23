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
          directTotal: 1075,
          inheritedTotal: 0,
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
    const nbsp = ' ';
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
        { tagId: 'sub-1', tagName: 'Restaurants', parentId: 'root-1', total: 40, directTotal: 40, inheritedTotal: 0, breakdown: { EXPENSE: 40 } },
        { tagId: 'root-2', tagName: 'Transport', parentId: null, total: 200, directTotal: 200, inheritedTotal: 0, breakdown: { EXPENSE: 200 } },
        { tagId: 'root-1', tagName: 'Food', parentId: null, total: 100, directTotal: 60, inheritedTotal: 40, breakdown: { EXPENSE: 60 } },
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
    // Defensive fallback: the current backend (Fase 3) always includes the parent's own
    // entry once any of its subtags accumulate something (confirmed via
    // TagAccumulationEndToEndTest#accumulation_taggedOnlyOnSubtag_...), so this specific
    // shape shouldn't occur in practice anymore — kept as a guard against a payload where
    // the parent entry is missing for any other reason (partial response, future API change).
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        { tagId: 'sub-1', tagName: 'Restaurants', parentId: 'root-1', total: 40, directTotal: 40, inheritedTotal: 0, breakdown: { EXPENSE: 40 } },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as { accumulationRows: () => readonly { tagId: string }[] }
    ).accumulationRows();

    expect(rows.map((r) => r.tagId)).toEqual(['sub-1']);
  });

  // ── Fase 3: rollup detail (directTotal/inheritedTotal) ─────────────────────

  it('shows a "Direto · Herdado" rollup detail on a parent-tag row', () => {
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        {
          tagId: 'root-1',
          tagName: 'Transporte',
          parentId: null,
          total: 170,
          directTotal: 50,
          inheritedTotal: 120,
          breakdown: { EXPENSE: 50, INSTALLMENT: 120 },
        },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as {
        accumulationRows: () => readonly { total: number; rollupDetail: string | null }[];
      }
    ).accumulationRows();

    const nbsp = ' ';
    expect(rows[0].total).toBe(170);
    expect(rows[0].rollupDetail).toBe(`Direto: R$${nbsp}50,00 · Herdado: R$${nbsp}120,00`);
  });

  it('formats a parent-only-inherited row (directTotal: 0) correctly', () => {
    // Mirrors the backend's own E2E case (accumulation_taggedOnlyOnSubtag_
    // parentInheritsWithoutManualDoubleTagging): an item tagged ONLY on the subtag —
    // the parent gets an entry with directTotal 0, inheritedTotal == the subtag's total,
    // no manual double-tagging needed.
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        {
          tagId: 'root-1',
          tagName: 'Casa',
          parentId: null,
          total: 80,
          directTotal: 0,
          inheritedTotal: 80,
          breakdown: { EXPENSE: 80 },
        },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as {
        accumulationRows: () => readonly { total: number; rollupDetail: string | null }[];
      }
    ).accumulationRows();

    const nbsp = ' ';
    expect(rows[0].total).toBe(80);
    expect(rows[0].rollupDetail).toBe(`Direto: R$${nbsp}0,00 · Herdado: R$${nbsp}80,00`);
  });

  it('never shows a rollup detail on a subtag row', () => {
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        {
          tagId: 'sub-1',
          tagName: 'Uber',
          parentId: 'root-1',
          total: 120,
          directTotal: 120,
          inheritedTotal: 0,
          breakdown: { INSTALLMENT: 120 },
        },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as { accumulationRows: () => readonly { rollupDetail: string | null }[] }
    ).accumulationRows();

    expect(rows[0].rollupDetail).toBeNull();
  });

  it('matches the README example: parent with direct items + a subtag rolls up correctly', () => {
    // "Transporte" (pai) tem 2 itens tagueados diretamente (R$50) + subtag "Uber" com
    // R$120 tagueados nela — Transporte → Total R$170, Direto R$50, Herdado R$120.
    tagAccumulationService.accumulation$.next({
      walletId: 'wallet-1',
      entries: [
        {
          tagId: 'root-1',
          tagName: 'Transporte',
          parentId: null,
          total: 170,
          directTotal: 50,
          inheritedTotal: 120,
          breakdown: { EXPENSE: 50, INSTALLMENT: 120 },
        },
        {
          tagId: 'sub-1',
          tagName: 'Uber',
          parentId: 'root-1',
          total: 120,
          directTotal: 120,
          inheritedTotal: 0,
          breakdown: { INSTALLMENT: 120 },
        },
      ],
    });
    fixture.detectChanges();

    const rows = (
      component as unknown as {
        accumulationRows: () => readonly { tagId: string; total: number; rollupDetail: string | null }[];
      }
    ).accumulationRows();

    const nbsp = ' ';
    const parentRow = rows.find((r) => r.tagId === 'root-1');
    const subRow = rows.find((r) => r.tagId === 'sub-1');

    expect(parentRow?.total).toBe(170);
    expect(parentRow?.rollupDetail).toBe(`Direto: R$${nbsp}50,00 · Herdado: R$${nbsp}120,00`);
    expect(subRow?.total).toBe(120);
    expect(subRow?.rollupDetail).toBeNull();
  });
});
