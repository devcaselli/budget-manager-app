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

  function filteredListItems() {
    return (
      component as unknown as {
        filteredListItems: () => readonly { id: string; description: string }[];
      }
    ).filteredListItems();
  }

  function setSearch(value: string): void {
    (component as unknown as { onSearchTermChange: (v: string) => void }).onSearchTermChange(value);
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

  it('filters by case-insensitive name match', () => {
    installmentService.installments$.next([
      buildInstallment({ id: 'a', description: 'Notebook' }),
      buildInstallment({ id: 'b', description: 'Phone' }),
    ]);
    fixture.detectChanges();

    setSearch('note');

    expect(filteredListItems().map((i) => i.id)).toEqual(['a']);
  });

  it('filters by assigned tag name, not just item name', () => {
    tagService.tags$.next([{ id: 'tag-1', name: 'Electronics', parentId: null }]);
    installmentService.installments$.next([
      buildInstallment({ id: 'a', description: 'Notebook', tagIds: ['tag-1'] }),
      buildInstallment({ id: 'b', description: 'Phone', tagIds: [] }),
    ]);
    fixture.detectChanges();

    setSearch('electronics');

    expect(filteredListItems().map((i) => i.id)).toEqual(['a']);
  });

  it('returns no items when nothing matches name or tag', () => {
    installmentService.installments$.next([buildInstallment({ id: 'a', description: 'Notebook' })]);
    fixture.detectChanges();

    setSearch('nonexistent');

    expect(filteredListItems()).toHaveLength(0);
  });
});
