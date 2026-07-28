import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { InstallmentFilter, InstallmentService } from '@features/installment/services/installment.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { TagService } from '@features/tag/services/tag.service';
import { Installment, CreditCard } from '@features/installment/models/installment';
import { Tag } from '@features/tag/models/tag';
import { Wallet } from '@features/wallet/models/wallet';

import { InstallmentPage } from './installment-page';

// ── Fakes ──────────────────────────────────────────────────────────────────
// Only the search-by-name-or-tag filtering (Tags Fase 2, Task 3) is under test here —
// we stub every injected service so the component drives installments$/tags$ directly,
// with no HTTP wiring.

class FakeInstallmentService {
  readonly installments$ = new BehaviorSubject<readonly Installment[]>([]);
  readonly allInstallments$ = new BehaviorSubject<readonly Installment[]>([]);
  readonly pagination$ = new BehaviorSubject({ page: 0, size: 7, totalElements: 0, totalPages: 0 });
  readonly creditCards$ = new BehaviorSubject<readonly CreditCard[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  readonly filter$ = new BehaviorSubject<InstallmentFilter>({
    creditCardId: null,
    sort: 'ENDING_SOON',
    page: 0,
    size: 7,
  });
  loadByWalletId = vi.fn();
  setFilter = vi.fn();
}

class FakeTagService {
  readonly tags$ = new BehaviorSubject<readonly Tag[]>([]);
  loadAll = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
  findPayersByWalletId(): Observable<unknown[]> {
    return of([]);
  }
}

function buildInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'inst-1',
    description: 'Notebook',
    details: null,
    originalValue: 1000,
    installmentValue: 100,
    currency: 'BRL',
    installmentNumber: 10,
    purchaseDate: '2026-01-01',
    lastInstallmentDate: '2026-10',
    creditCardId: 'card-1',
    sourceWalletId: 'wallet-1',
    sourceEffectiveMonth: '2026-01',
    shared: false,
    ownerRatio: null,
    effectiveOriginalValue: 1000,
    effectiveInstallmentValue: 100,
    tagIds: [],
    ...overrides,
  };
}

describe('InstallmentPage — search by name or tag', () => {
  let fixture: ComponentFixture<InstallmentPage>;
  let component: InstallmentPage;
  let installmentService: FakeInstallmentService;
  let tagService: FakeTagService;

  beforeEach(() => {
    vi.useFakeTimers();
    installmentService = new FakeInstallmentService();
    tagService = new FakeTagService();

    TestBed.configureTestingModule({
      imports: [InstallmentPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InstallmentService, useValue: installmentService },
        { provide: TagService, useValue: tagService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(InstallmentPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function filteredListItems() {
    return (
      component as unknown as {
        filteredListItems: () => readonly { id: string; description: string }[];
      }
    ).filteredListItems();
  }

  function searchControl() {
    return (component as unknown as { searchControl: { setValue: (v: string) => void } }).searchControl;
  }

  /** Sets the search control and flushes its 150ms debounce. */
  async function setSearch(value: string): Promise<void> {
    searchControl().setValue(value);
    await vi.advanceTimersByTimeAsync(150);
    fixture.detectChanges();
  }

  it('shows all items when the search term is empty', () => {
    installmentService.installments$.next([
      buildInstallment({ id: 'a', description: 'Notebook' }),
      buildInstallment({ id: 'b', description: 'Phone' }),
    ]);
    fixture.detectChanges();

    expect(filteredListItems()).toHaveLength(2);
  });

  it('filters by case-insensitive name match', async () => {
    const items = [
      buildInstallment({ id: 'a', description: 'Notebook' }),
      buildInstallment({ id: 'b', description: 'Phone' }),
    ];
    // Real InstallmentService loads installments$ (page) and allInstallments$ (full set)
    // together in one request (see its constructor's forkJoin) — populating both here
    // mirrors that, since an active search reads from allInstallments$ (see the "outside
    // the loaded page" regression test below for why).
    installmentService.installments$.next(items);
    installmentService.allInstallments$.next(items);
    fixture.detectChanges();

    await setSearch('note');

    expect(filteredListItems().map((i) => i.id)).toEqual(['a']);
  });

  it('filters by assigned tag name, not just item name', async () => {
    tagService.tags$.next([{ id: 'tag-1', name: 'Electronics', parentId: null }]);
    const items = [
      buildInstallment({ id: 'a', description: 'Notebook', tagIds: ['tag-1'] }),
      buildInstallment({ id: 'b', description: 'Phone', tagIds: [] }),
    ];
    installmentService.installments$.next(items);
    installmentService.allInstallments$.next(items);
    fixture.detectChanges();

    await setSearch('electronics');

    expect(filteredListItems().map((i) => i.id)).toEqual(['a']);
  });

  it('returns no items when nothing matches name or tag', async () => {
    const items = [buildInstallment({ id: 'a', description: 'Notebook' })];
    installmentService.installments$.next(items);
    installmentService.allInstallments$.next(items);
    fixture.detectChanges();

    await setSearch('nonexistent');

    expect(filteredListItems()).toHaveLength(0);
  });

  it('actually narrows the rendered rows, not just the computed', async () => {
    const items = [
      buildInstallment({ id: 'a', description: 'Notebook' }),
      buildInstallment({ id: 'b', description: 'Phone' }),
    ];
    installmentService.installments$.next(items);
    installmentService.allInstallments$.next(items);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.installment-alloc').length).toBe(2);

    await setSearch('note');

    const rows = fixture.nativeElement.querySelectorAll('.installment-alloc');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Notebook');
  });

  it('debounces rapid typing into a single filter pass', async () => {
    const items = [
      buildInstallment({ id: 'a', description: 'Notebook' }),
      buildInstallment({ id: 'b', description: 'Phone' }),
    ];
    installmentService.installments$.next(items);
    installmentService.allInstallments$.next(items);
    fixture.detectChanges();

    const control = searchControl();
    control.setValue('n');
    control.setValue('no');
    control.setValue('not');
    await vi.advanceTimersByTimeAsync(50); // still within the 150ms debounce window
    fixture.detectChanges();
    expect(filteredListItems()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(150);
    fixture.detectChanges();
    expect(filteredListItems().map((i) => i.id)).toEqual(['a']);
  });

  // Regression: search used to filter only `installments$` (the current server-side
  // page, 7 items by default), so an installment sitting on any other page could never
  // match, no matter how exact the query — the bug this suite is guarding against.
  it('finds an installment that only exists in the full wallet set, outside the loaded page', async () => {
    // Current page (what installments$ holds) has no match at all.
    installmentService.installments$.next([
      buildInstallment({ id: 'a', description: 'Phone' }),
    ]);
    // allInstallments$ is the wallet's full, unpaginated set — the match lives only here.
    installmentService.allInstallments$.next([
      buildInstallment({ id: 'a', description: 'Phone' }),
      buildInstallment({ id: 'z', description: 'Notebook' }),
    ]);
    fixture.detectChanges();

    await setSearch('note');

    expect(filteredListItems().map((i) => i.id)).toEqual(['z']);
  });

  it('falls back to the current page when the search term is cleared', async () => {
    installmentService.installments$.next([
      buildInstallment({ id: 'a', description: 'Phone' }),
    ]);
    installmentService.allInstallments$.next([
      buildInstallment({ id: 'a', description: 'Phone' }),
      buildInstallment({ id: 'z', description: 'Notebook' }),
    ]);
    fixture.detectChanges();

    await setSearch('note');
    expect(filteredListItems().map((i) => i.id)).toEqual(['z']);

    await setSearch('');
    // Empty query: back to page-scoped results (unchanged pagination behavior) — only
    // 'a' (Phone) is on the loaded page, 'z' lives elsewhere in the wallet.
    expect(filteredListItems().map((i) => i.id)).toEqual(['a']);
  });
});
