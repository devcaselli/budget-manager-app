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
import { OmegaViewerLauncher } from '@shared/components/omega-viewer/omega-viewer-launcher';
import { OmegaViewerResult } from '@shared/components/omega-viewer/models/omega-viewer-result';

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

class FakeOmegaViewerLauncher {
  readonly result$ = new BehaviorSubject<OmegaViewerResult>({ mutated: false });
  open = vi.fn().mockReturnValue(this.result$.asObservable());
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
    vi.useFakeTimers();
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

  afterEach(() => {
    vi.useRealTimers();
  });

  function filteredItems() {
    return (
      component as unknown as {
        filteredSubscriptionItems: () => readonly { id: string; description: string }[];
      }
    ).filteredSubscriptionItems();
  }

  /** Sets the search control and flushes its 150ms debounce. */
  async function setSearch(value: string): Promise<void> {
    (component as unknown as { searchControl: { setValue: (v: string) => void } }).searchControl.setValue(value);
    await vi.advanceTimersByTimeAsync(150);
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

  it('filters by case-insensitive name match', async () => {
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix' }),
      buildSubscription({ id: 'b', description: 'Spotify' }),
    ]);
    fixture.detectChanges();

    await setSearch('net');

    expect(filteredItems().map((i) => i.id)).toEqual(['a']);
  });

  it('filters by assigned tag name, not just item name', async () => {
    tagService.tags$.next([{ id: 'tag-1', name: 'Streaming', parentId: null }]);
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix', tagIds: ['tag-1'] }),
      buildSubscription({ id: 'b', description: 'Spotify', tagIds: [] }),
    ]);
    fixture.detectChanges();

    await setSearch('streaming');

    expect(filteredItems().map((i) => i.id)).toEqual(['a']);
  });

  it('composes search with the existing state filter (AND)', async () => {
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix', state: 'PRODUCTION' }),
      buildSubscription({ id: 'b', description: 'Netflix Kids', state: 'PREVIEW' }),
    ]);
    fixture.detectChanges();

    (component as unknown as { setSubscriptionFilter: (f: string) => void }).setSubscriptionFilter(
      'production',
    );
    await setSearch('netflix');

    expect(filteredItems().map((i) => i.id)).toEqual(['a']);
  });

  it('returns no items when nothing matches name or tag', async () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'a', description: 'Netflix' })]);
    fixture.detectChanges();

    await setSearch('nonexistent');

    expect(filteredItems()).toHaveLength(0);
  });

  it('actually narrows the rendered rows, not just the computed', async () => {
    subscriptionService.subscriptions$.next([
      buildSubscription({ id: 'a', description: 'Netflix' }),
      buildSubscription({ id: 'b', description: 'Spotify' }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.ew-sub').length).toBe(2);

    await setSearch('net');

    const rows = fixture.nativeElement.querySelectorAll('.ew-sub');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Netflix');
  });
});

describe('SubscriptionPage — openViewer — Omega Viewer launcher integration (F-16)', () => {
  let fixture: ComponentFixture<SubscriptionPage>;
  let component: SubscriptionPage;
  let subscriptionService: FakeSubscriptionService;
  let omegaViewerLauncher: FakeOmegaViewerLauncher;

  beforeEach(() => {
    subscriptionService = new FakeSubscriptionService();
    omegaViewerLauncher = new FakeOmegaViewerLauncher();

    TestBed.configureTestingModule({
      imports: [SubscriptionPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: CreditCardService, useClass: FakeCreditCardService },
        { provide: TagService, useClass: FakeTagService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: OmegaViewerLauncher, useValue: omegaViewerLauncher },
      ],
    });

    fixture = TestBed.createComponent(SubscriptionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function subscriptionItems() {
    return (
      component as unknown as {
        subscriptionItems: () => readonly { id: string; description: string }[];
      }
    ).subscriptionItems();
  }

  it('opens the launcher with the SUBSCRIPTION ref and does NOT reload the list when the result is unmutated', () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'sub-1' })]);
    fixture.detectChanges();
    subscriptionService.loadSubscriptions.mockClear();

    const [item] = subscriptionItems();
    (component as unknown as { openViewer: (s: unknown) => void }).openViewer(item);

    expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'SUBSCRIPTION', id: 'sub-1' });

    omegaViewerLauncher.result$.next({ mutated: false });

    expect(subscriptionService.loadSubscriptions).not.toHaveBeenCalled();
  });

  it('reloads subscriptions when the launcher result reports mutated:true', () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'sub-1' })]);
    fixture.detectChanges();
    subscriptionService.loadSubscriptions.mockClear();

    const [item] = subscriptionItems();
    (component as unknown as { openViewer: (s: unknown) => void }).openViewer(item);

    omegaViewerLauncher.result$.next({ mutated: true });

    expect(subscriptionService.loadSubscriptions).toHaveBeenCalled();
  });

  it('opens the viewer from the info-cell keyboard trigger (Enter) — role=button, tabindex=0', () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'sub-1', description: 'Netflix' })]);
    fixture.detectChanges();

    const infoCell = fixture.nativeElement.querySelector('div[role="button"]');
    expect(infoCell).toBeTruthy();
    expect(infoCell.getAttribute('tabindex')).toBe('0');

    infoCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'SUBSCRIPTION', id: 'sub-1' });
  });

  it('opens the viewer from the info-cell keyboard trigger (Space)', () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'sub-1', description: 'Netflix' })]);
    fixture.detectChanges();

    const infoCell = fixture.nativeElement.querySelector('div[role="button"]');
    infoCell.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'SUBSCRIPTION', id: 'sub-1' });
  });

  it('opens the viewer from the visibility icon button in the row actions cluster', () => {
    subscriptionService.subscriptions$.next([buildSubscription({ id: 'sub-1', description: 'Netflix' })]);
    fixture.detectChanges();

    const viewButton = fixture.nativeElement.querySelector('button[title="View subscription"]');
    expect(viewButton).toBeTruthy();

    viewButton.click();

    expect(omegaViewerLauncher.open).toHaveBeenCalledWith({ kind: 'SUBSCRIPTION', id: 'sub-1' });
  });
});
