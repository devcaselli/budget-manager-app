import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { Bullet, CreateBulletRequest, UpdateBulletRequest } from '@features/bullet/models/bullet';
import { BulletService } from '@features/bullet/services/bullet.service';
import { ExtraBudget, CreateExtraBudgetRequest } from '@features/extra-budget/models/extra-budget';
import { ExtraBudgetService } from '@features/extra-budget/services/extra-budget.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Wallet } from '@features/wallet/models/wallet';
import { OmegaViewerLauncher } from '@shared/components/omega-viewer/omega-viewer-launcher';
import { OmegaViewerResult } from '@shared/components/omega-viewer/models/omega-viewer-result';

import { BulletPage } from './bullet-page';

// RBM-F15/F17 — first page spec of this feature. Scope: the migration badge's Map-based
// derivation (never .some()/.filter() per bullet — RBM-F15's own complexity rule) and the
// Omega Viewer launcher wiring, including the mutated-vs-not-mutated reload gate.

class FakeBulletService {
  readonly bullets$ = new BehaviorSubject<readonly Bullet[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly updating$ = new BehaviorSubject<string | null>(null);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);

  loadByWalletId = vi.fn();
  create = vi.fn((_input: CreateBulletRequest): Observable<Bullet> => of({} as Bullet));
  update = vi.fn((_id: string, _input: UpdateBulletRequest): Observable<Bullet> => of({} as Bullet));
  delete = vi.fn((_id: string): Observable<void> => of(undefined));
}

class FakeExtraBudgetService {
  readonly extraBudgets$ = new BehaviorSubject<readonly ExtraBudget[]>([]);
  readonly saving$ = new BehaviorSubject(false);

  loadByWalletId = vi.fn();
  create = vi.fn((_input: CreateExtraBudgetRequest): Observable<ExtraBudget> => of({} as ExtraBudget));
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
  loadWallets = vi.fn();
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'wallet-1',
    description: 'Main',
    budget: 1000,
    remaining: 500,
    startDate: '2030-01-01',
    closedDate: null,
    closed: false,
    effectiveMonth: '2030-01',
    state: 'PRODUCTION',
    ...overrides,
  };
}

function buildBullet(overrides: Partial<Bullet> = {}): Bullet {
  return {
    id: 'bullet-1',
    description: 'Groceries',
    budget: 500,
    remaining: 300,
    walletId: 'wallet-1',
    ...overrides,
  };
}

function buildExtraBudget(overrides: Partial<ExtraBudget> = {}): ExtraBudget {
  return {
    id: 'eb-1',
    description: 'Migration',
    walletId: 'wallet-1',
    amount: 100,
    currency: 'BRL',
    allocations: [{ bulletId: 'bullet-1', amount: 100 }],
    deleted: false,
    deletedAt: null,
    sourceType: 'RESERVED_BUDGET_MIGRATION',
    ...overrides,
  };
}

describe('BulletPage — migration badge and Omega Viewer wiring (RBM-F15)', () => {
  let fixture: ComponentFixture<BulletPage>;
  let component: BulletPage;
  let bulletService: FakeBulletService;
  let extraBudgetService: FakeExtraBudgetService;
  let walletService: FakeWalletService;
  let launcherOpen: ReturnType<typeof vi.fn>;

  function configure(): void {
    bulletService = new FakeBulletService();
    extraBudgetService = new FakeExtraBudgetService();
    walletService = new FakeWalletService();
    launcherOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [BulletPage],
      providers: [
        { provide: BulletService, useValue: bulletService },
        { provide: ExtraBudgetService, useValue: extraBudgetService },
        { provide: WalletService, useValue: walletService },
        { provide: OmegaViewerLauncher, useValue: { open: launcherOpen } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(BulletPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function selectWallet(
    wallet: Wallet,
    bullets: readonly Bullet[] = [],
    extraBudgets: readonly ExtraBudget[] = [],
  ): void {
    walletService.selectedWallet$.next(wallet);
    bulletService.bullets$.next(bullets);
    extraBudgetService.extraBudgets$.next(extraBudgets);
    fixture.detectChanges();
    bulletService.loadByWalletId.mockClear();
    extraBudgetService.loadByWalletId.mockClear();
    walletService.loadWallets.mockClear();
  }

  function bulletItems() {
    return (
      component as unknown as {
        bulletItems: () => readonly {
          id: string;
          migrationCount: number;
          firstMigrationExtraBudgetId: string | null;
        }[];
      }
    ).bulletItems();
  }

  function openMigrationViewer(bullet: ReturnType<typeof bulletItems>[number]): void {
    (component as unknown as { openMigrationViewer: (bullet: unknown) => void }).openMigrationViewer(
      bullet,
    );
  }

  beforeEach(() => configure());

  it('a bullet with no migrations has migrationCount 0 and no firstMigrationExtraBudgetId', () => {
    selectWallet(buildWallet(), [buildBullet()], []);

    const [item] = bulletItems();
    expect(item.migrationCount).toBe(0);
    expect(item.firstMigrationExtraBudgetId).toBeNull();
  });

  it('a bullet with 1 migration has migrationCount 1 and the extraBudgetId set', () => {
    selectWallet(buildWallet(), [buildBullet()], [buildExtraBudget()]);

    const [item] = bulletItems();
    expect(item.migrationCount).toBe(1);
    expect(item.firstMigrationExtraBudgetId).toBe('eb-1');
  });

  it('a bullet with 3 migrations has migrationCount 3', () => {
    selectWallet(
      buildWallet(),
      [buildBullet()],
      [
        buildExtraBudget({ id: 'eb-1' }),
        buildExtraBudget({ id: 'eb-2' }),
        buildExtraBudget({ id: 'eb-3' }),
      ],
    );

    const [item] = bulletItems();
    expect(item.migrationCount).toBe(3);
  });

  it('manual (non-migration) extra budgets never count toward migrationCount', () => {
    selectWallet(
      buildWallet(),
      [buildBullet()],
      [buildExtraBudget({ sourceType: 'MANUAL' })],
    );

    const [item] = bulletItems();
    expect(item.migrationCount).toBe(0);
  });

  it('an extra budget allocated to a different bullet does not count for this one', () => {
    selectWallet(
      buildWallet(),
      [buildBullet({ id: 'bullet-1' }), buildBullet({ id: 'bullet-2', description: 'Fuel' })],
      [buildExtraBudget({ allocations: [{ bulletId: 'bullet-2', amount: 100 }] })],
    );

    const [bullet1, bullet2] = bulletItems();
    expect(bullet1.migrationCount).toBe(0);
    expect(bullet2.migrationCount).toBe(1);
  });

  it('clicking the badge opens the launcher with { kind: RESERVED_BUDGET_MIGRATION, id: extraBudgetId }', () => {
    selectWallet(buildWallet(), [buildBullet()], [buildExtraBudget()]);
    launcherOpen.mockReturnValue(of<OmegaViewerResult>({ mutated: false }));

    openMigrationViewer(bulletItems()[0]);

    expect(launcherOpen).toHaveBeenCalledWith({ kind: 'RESERVED_BUDGET_MIGRATION', id: 'eb-1' });
  });

  it('result.mutated === true reloads bullet/wallet/extra-budget context', () => {
    selectWallet(buildWallet(), [buildBullet()], [buildExtraBudget()]);
    launcherOpen.mockReturnValue(of<OmegaViewerResult>({ mutated: true }));

    openMigrationViewer(bulletItems()[0]);

    expect(bulletService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
    expect(walletService.loadWallets).toHaveBeenCalledTimes(1);
    expect(extraBudgetService.loadByWalletId).toHaveBeenCalledWith('wallet-1');
  });

  it('result.mutated === false triggers no reload at all', () => {
    selectWallet(buildWallet(), [buildBullet()], [buildExtraBudget()]);
    launcherOpen.mockReturnValue(of<OmegaViewerResult>({ mutated: false }));

    openMigrationViewer(bulletItems()[0]);

    expect(bulletService.loadByWalletId).not.toHaveBeenCalled();
    expect(walletService.loadWallets).not.toHaveBeenCalled();
    expect(extraBudgetService.loadByWalletId).not.toHaveBeenCalled();
  });

  it('a bullet with no migrations never opens the launcher, even if invoked directly', () => {
    selectWallet(buildWallet(), [buildBullet()], []);

    openMigrationViewer(bulletItems()[0]);

    expect(launcherOpen).not.toHaveBeenCalled();
  });

  it('renders no badge for a bullet with 0 migrations', () => {
    selectWallet(buildWallet(), [buildBullet()], []);

    expect(fixture.nativeElement.querySelector('.bullet-migration-badge')).toBeNull();
  });

  it('renders a badge with no visible count for exactly 1 migration', () => {
    selectWallet(buildWallet(), [buildBullet()], [buildExtraBudget()]);

    const badge = fixture.nativeElement.querySelector('.bullet-migration-badge');
    expect(badge).not.toBeNull();
    expect(badge.querySelector('span')).toBeNull();
    expect(badge.getAttribute('aria-label')).toContain('Groceries');
  });

  it('renders the count for 3 migrations', () => {
    selectWallet(
      buildWallet(),
      [buildBullet()],
      [
        buildExtraBudget({ id: 'eb-1' }),
        buildExtraBudget({ id: 'eb-2' }),
        buildExtraBudget({ id: 'eb-3' }),
      ],
    );

    const badge = fixture.nativeElement.querySelector('.bullet-migration-badge');
    expect(badge.querySelector('span')?.textContent?.trim()).toBe('3');
  });

  it('the badge is a real <button>, not a clickable span', () => {
    selectWallet(buildWallet(), [buildBullet()], [buildExtraBudget()]);

    const badge = fixture.nativeElement.querySelector('.bullet-migration-badge');
    expect(badge.tagName.toLowerCase()).toBe('button');
  });
});
