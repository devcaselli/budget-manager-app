import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { CreditCardService } from '@features/credit-card/services/credit-card.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { TagService } from '@features/tag/services/tag.service';
import { Subscription } from '@features/subscription/models/subscription';
import { Tag } from '@features/tag/models/tag';
import { Wallet } from '@features/wallet/models/wallet';

import { SubscriptionPage } from './subscription-page';

// ── Fakes ──────────────────────────────────────────────────────────────────
// Only the search-by-name-or-tag filtering (Tags Fase 2, Task 3), composed with the
// pre-existing state filter, is under test here.

class FakeSubscriptionService {
  readonly subscriptions$ = new BehaviorSubject<readonly Subscription[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly updating$ = new BehaviorSubject<string | null>(null);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadSubscriptions = vi.fn();
}

class FakeCreditCardService {
  readonly cards$ = new BehaviorSubject<readonly unknown[]>([]);
  loadAll = vi.fn();
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

function buildSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    description: 'Netflix',
    currency: 'BRL',
    state: 'PRODUCTION',
    flag: 'NONE',
    startMonth: '2026-01',
    endMonth: null,
    versions: [{ effectiveMonth: '2026-01', amount: 30 }],
    creditCardId: null,
    tagIds: [],
    ...overrides,
  };
}

describe('SubscriptionPage — search by name or tag', () => {
  let fixture: ComponentFixture<SubscriptionPage>;
  let component: SubscriptionPage;
  let subscriptionService: FakeSubscriptionService;
  let tagService: FakeTagService;

  beforeEach(() => {
    subscriptionService = new FakeSubscriptionService();
    tagService = new FakeTagService();

    TestBed.configureTestingModule({
      imports: [SubscriptionPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: CreditCardService, useClass: FakeCreditCardService },
        { provide: TagService, useValue: tagService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(SubscriptionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function filteredItems() {
    return (
      component as unknown as {
        filteredSubscriptionItems: () => readonly { id: string; description: string }[];
      }
    ).filteredSubscriptionItems();
  }

  function setSearch(value: string): void {
    (component as unknown as { onSearchTermChange: (v: string) => void }).onSearchTermChange(value);
    fixture.detectChanges();
  }

  it('shows all items when the search term is empty', () => {
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix' }),
      buildSubscription({ id: 'b', description: 'Spotify' }),
    ]);
    fixture.detectChanges();

    expect(filteredItems()).toHaveLength(2);
  });

  it('filters by case-insensitive name match', () => {
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix' }),
      buildSubscription({ id: 'b', description: 'Spotify' }),
    ]);
    fixture.detectChanges();

    setSearch('net');

    expect(filteredItems().map((i) => i.id)).toEqual(['a']);
  });

  it('filters by assigned tag name, not just item name', () => {
    tagService.tags$.next([{ id: 'tag-1', name: 'Streaming', parentId: null }]);
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix', tagIds: ['tag-1'] }),
      buildSubscription({ id: 'b', description: 'Spotify', tagIds: [] }),
    ]);
    fixture.detectChanges();

    setSearch('streaming');

    expect(filteredItems().map((i) => i.id)).toEqual(['a']);
  });

  it('composes search with the existing state filter (AND)', () => {
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix', state: 'PRODUCTION' }),
      buildSubscription({ id: 'b', description: 'Netflix Kids', state: 'PREVIEW' }),
    ]);
    fixture.detectChanges();

    (component as unknown as { setSubscriptionFilter: (f: string) => void }).setSubscriptionFilter(
      'production',
    );
    setSearch('netflix');

    expect(filteredItems().map((i) => i.id)).toEqual(['a']);
  });

  it('returns no items when nothing matches name or tag', () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'a', description: 'Netflix' })]);
    fixture.detectChanges();

    setSearch('nonexistent');

    expect(filteredItems()).toHaveLength(0);
  });
});
