import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { ExtraBudget } from '@features/extra-budget/models/extra-budget';
import { ExtraBudgetService } from '@features/extra-budget/services/extra-budget.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Wallet } from '@features/wallet/models/wallet';

import { ExtraBudgetPage } from './extra-budget-page';

// RBM-F11 — locks that the Extra Budget screen is NOT a migration revert point (RBM-F8): the
// origin badge and the disabled undo button, plus the code-level guard in revertExtraBudget()
// (not just the template's [disabled]), so manual EBs keep working exactly as before.

class FakeExtraBudgetService {
  readonly extraBudgets$ = new BehaviorSubject<readonly ExtraBudget[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly saving$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject<string | null>(null);
  readonly error$ = new BehaviorSubject<string | null>(null);

  loadByWalletId = vi.fn();
  delete = vi.fn();
}

class FakeBulletService {
  readonly bullets$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
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

function buildExtraBudget(overrides: Partial<ExtraBudget> = {}): ExtraBudget {
  return {
    id: 'eb-1',
    description: 'Bonus',
    walletId: 'wallet-1',
    amount: 200,
    currency: 'BRL',
    allocations: [],
    deleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('ExtraBudgetPage — migration source badge and blocked undo (RBM-F11)', () => {
  let fixture: ComponentFixture<ExtraBudgetPage>;
  let component: ExtraBudgetPage;
  let extraBudgetService: FakeExtraBudgetService;
  let walletService: FakeWalletService;

  function configure(): void {
    extraBudgetService = new FakeExtraBudgetService();
    walletService = new FakeWalletService();

    TestBed.configureTestingModule({
      imports: [ExtraBudgetPage],
      providers: [
        { provide: ExtraBudgetService, useValue: extraBudgetService },
        { provide: BulletService, useClass: FakeBulletService },
        { provide: WalletService, useValue: walletService },
      ],
    });

    fixture = TestBed.createComponent(ExtraBudgetPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function seed(extraBudgets: readonly ExtraBudget[]): void {
    walletService.selectedWallet$.next(buildWallet());
    extraBudgetService.extraBudgets$.next(extraBudgets);
    fixture.detectChanges();
  }

  function activeItems() {
    return (component as unknown as {
      activeExtraBudgets: () => readonly { id: string; isMigration: boolean }[];
    }).activeExtraBudgets();
  }

  function revertExtraBudget(item: ReturnType<typeof activeItems>[number]): void {
    (component as unknown as { revertExtraBudget: (item: unknown) => void }).revertExtraBudget(item);
  }

  beforeEach(() => configure());

  it('a migration-sourced EB renders the badge and has the undo button disabled', () => {
    seed([buildExtraBudget({ sourceType: 'RESERVED_BUDGET_MIGRATION' })]);

    const root = fixture.nativeElement as HTMLElement;
    const badge = root.querySelector('.ebp-source-badge');
    const undoButton = root.querySelector<HTMLButtonElement>('.ebp-icon-btn--danger');

    expect(badge).toBeTruthy();
    expect(undoButton?.disabled).toBe(true);
  });

  it('a MANUAL EB has no badge, has an enabled button, and revertExtraBudget calls delete', () => {
    extraBudgetService.delete.mockReturnValue(new BehaviorSubject(undefined));
    seed([buildExtraBudget({ sourceType: 'MANUAL' })]);

    const root = fixture.nativeElement as HTMLElement;
    const badge = root.querySelector('.ebp-source-badge');
    const undoButton = root.querySelector<HTMLButtonElement>('.ebp-icon-btn--danger');

    expect(badge).toBeFalsy();
    expect(undoButton?.disabled).toBe(false);

    revertExtraBudget(activeItems()[0]);

    expect(extraBudgetService.delete).toHaveBeenCalledWith('eb-1');
  });

  it('a legacy EB without sourceType is treated as MANUAL and does not crash', () => {
    const legacy = buildExtraBudget();
    delete (legacy as { sourceType?: unknown }).sourceType;

    expect(() => seed([legacy])).not.toThrow();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.ebp-source-badge')).toBeFalsy();
    expect(activeItems()[0].isMigration).toBe(false);
  });

  it('revertExtraBudget() called programmatically on a migration item never calls delete', () => {
    seed([buildExtraBudget({ sourceType: 'RESERVED_BUDGET_MIGRATION' })]);

    revertExtraBudget(activeItems()[0]);

    expect(extraBudgetService.delete).not.toHaveBeenCalled();
  });

  it('a mixed list renders exactly 1 badge and exactly 1 enabled button', () => {
    seed([
      buildExtraBudget({ id: 'eb-migration', sourceType: 'RESERVED_BUDGET_MIGRATION' }),
      buildExtraBudget({ id: 'eb-manual', sourceType: 'MANUAL' }),
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const badges = root.querySelectorAll('.ebp-source-badge');
    const buttons = root.querySelectorAll<HTMLButtonElement>('.ebp-icon-btn--danger');
    const enabledButtons = Array.from(buttons).filter((button) => !button.disabled);

    expect(badges.length).toBe(1);
    expect(enabledButtons.length).toBe(1);
  });
});
