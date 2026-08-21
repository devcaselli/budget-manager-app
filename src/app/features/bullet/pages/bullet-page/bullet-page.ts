import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import {
  ExtraBudgetAllocationDialogComponent,
  ExtraBudgetAllocationDialogData,
  ExtraBudgetAllocationDialogResult,
} from '@features/extra-budget/components/extra-budget-allocation-dialog/extra-budget-allocation-dialog.component';
import { ExtraBudgetService } from '@features/extra-budget/services/extra-budget.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { OmegaViewerLauncher } from '@shared/components/omega-viewer/omega-viewer-launcher';

import { BulletService } from '../../services/bullet.service';
import {
  BulletDeleteDialogComponent,
  BulletDeleteDialogData,
} from '../../components/bullet-delete-dialog/bullet-delete-dialog.component';
import {
  BulletEditDialogComponent,
  BulletEditDialogData,
  BulletEditDialogResult,
} from '../../components/bullet-edit-dialog/bullet-edit-dialog.component';

interface BulletListItem {
  readonly id: string;
  readonly description: string;
  readonly budget: number;
  readonly remaining: number;
  readonly used: number;
  readonly progress: number;
  /** Count of live reserved-budget migrations landed on this bullet this month — 0 renders no
   * badge. RBM-F15. */
  readonly migrationCount: number;
  /** `extraBudgetId` of the first migration into this bullet — what the Omega Viewer opens on
   * click. `null` when `migrationCount === 0`. With N > 1, the viewer opens on the first and the
   * rest stay reachable only from the Reserved Budget card unless the backend threads sibling
   * migrations into `refs` (RBM-F1 open question) — see `openMigrationViewer`'s doc comment. */
  readonly firstMigrationExtraBudgetId: string | null;
}

@Component({
  selector: 'app-bullet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, DecimalPipe, MatIconModule, ReactiveFormsModule],
  templateUrl: './bullet-page.html',
  styleUrl: './bullet-page.scss',
})
export class BulletPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly bulletService = inject(BulletService);
  private readonly extraBudgetService = inject(ExtraBudgetService);
  private readonly walletService = inject(WalletService);
  private readonly omegaViewerLauncher = inject(OmegaViewerLauncher);

  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly extraBudgets = toSignal(this.extraBudgetService.extraBudgets$, {
    initialValue: [],
  });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  /**
   * `extraBudgetId`s of every live reserved-budget migration, grouped by the bullet they landed
   * on — built ONCE per recomputation of `extraBudgets()`, O(E) (E extra budgets in the wallet).
   * The list, not just a count, is needed because the badge opens the viewer on a specific
   * `extraBudgetId` (RBM-F15's "first migration" behavior).
   *
   * Hard rule (RBM-F15's own complexity analysis): never `.some()`/`.filter()` per bullet inside
   * the `@for` — that would be O(B·E) per change-detection cycle on the whole bullets page (same
   * trap `sourceLabels()` already avoids in reserved-budget-page.ts). One `Map` built here, O(1)
   * lookup per bullet in `bulletItems()` below.
   */
  private readonly migrationExtraBudgetIdsByBulletId = computed<ReadonlyMap<string, readonly string[]>>(
    () => {
      const byBullet = new Map<string, string[]>();
      for (const extraBudget of this.extraBudgets()) {
        if (extraBudget.sourceType !== 'RESERVED_BUDGET_MIGRATION') continue;
        for (const allocation of extraBudget.allocations) {
          const existing = byBullet.get(allocation.bulletId);
          if (existing) {
            existing.push(extraBudget.id);
          } else {
            byBullet.set(allocation.bulletId, [extraBudget.id]);
          }
        }
      }
      return byBullet;
    },
  );

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.bulletService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.bulletService.saving$, { initialValue: false });
  protected readonly isAllocatingExtraBudget = toSignal(this.extraBudgetService.saving$, {
    initialValue: false,
  });
  protected readonly updatingBulletId = toSignal(this.bulletService.updating$, {
    initialValue: null,
  });
  protected readonly deletingBulletId = toSignal(this.bulletService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.bulletService.error$, { initialValue: null });

  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    budget: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly bulletItems = computed<readonly BulletListItem[]>(() => {
    const migrationsByBullet = this.migrationExtraBudgetIdsByBulletId();
    return this.bullets().map((bullet) => {
      const budget = Number(bullet.budget);
      const remaining = Number(bullet.remaining);
      const used = Math.max(budget - remaining, 0);
      const progress = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
      // O(1) map lookup, never .some()/.filter() here — see the Map's own doc comment.
      const migrationExtraBudgetIds = migrationsByBullet.get(bullet.id) ?? [];
      return {
        id: bullet.id,
        description: bullet.description,
        budget,
        remaining,
        used,
        progress,
        migrationCount: migrationExtraBudgetIds.length,
        firstMigrationExtraBudgetId: migrationExtraBudgetIds[0] ?? null,
      };
    });
  });

  protected readonly totalCap = computed(() =>
    this.bullets().reduce((acc, b) => acc + Number(b.budget), 0),
  );

  protected readonly totalUsed = computed(() =>
    this.bulletItems().reduce((acc, b) => acc + b.used, 0),
  );

  protected readonly overallPct = computed(() => {
    const cap = this.totalCap();
    if (cap <= 0) return 0;
    return Math.round((this.totalUsed() / cap) * 100);
  });

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.bulletService.loadByWalletId(walletId);
      // The page already had (or loaded in the same fan-out as) extra budgets for the create
      // flow's reload — RBM-F15 is the first thing that reads that stream on initial load too,
      // for the migration badge. No new request shape, just an earlier subscriber.
      this.extraBudgetService.loadByWalletId(walletId);
      this.resetForm();
    });
  }

  protected createBullet(): void {
    const wallet = this.selectedWallet();
    if (!wallet || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.bulletService
      .create({ description: value.description.trim(), budget: value.budget, walletId: wallet.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resetForm();
          this.walletService.loadWallets();
        },
        error: () => undefined,
      });
  }

  protected onDeleteClick(bullet: BulletListItem): void {
    const wallet = this.selectedWallet();
    const data: BulletDeleteDialogData = {
      bulletDescription: bullet.description,
      walletDescription: wallet?.description ?? 'wallet',
      allocatedAmount: bullet.budget,
    };

    this.dialog
      .open<BulletDeleteDialogComponent, BulletDeleteDialogData, boolean>(
        BulletDeleteDialogComponent,
        { width: '28rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.deleteBullet(bullet.id);
      });
  }

  protected onEditClick(bullet: BulletListItem): void {
    const wallet = this.selectedWallet();
    if (!wallet) return;

    const data: BulletEditDialogData = {
      bulletDescription: bullet.description,
      budget: bullet.budget,
      walletDescription: wallet.description,
    };

    this.dialog
      .open<BulletEditDialogComponent, BulletEditDialogData, BulletEditDialogResult>(
        BulletEditDialogComponent,
        { width: '32rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.updateBullet(wallet.id, bullet.id, result);
      });
  }

  protected openExtraBudgetDialog(bullet: BulletListItem): void {
    const wallet = this.selectedWallet();
    if (!wallet) return;

    const data: ExtraBudgetAllocationDialogData = {
      walletDescription: wallet.description,
      bullet: {
        id: bullet.id,
        description: bullet.description,
        budget: bullet.budget,
        remaining: bullet.remaining,
      },
    };

    this.dialog
      .open<
        ExtraBudgetAllocationDialogComponent,
        ExtraBudgetAllocationDialogData,
        ExtraBudgetAllocationDialogResult
      >(ExtraBudgetAllocationDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.createExtraBudget(wallet.id, bullet.id, result);
      });
  }

  /**
   * Opens the Omega Viewer on the bullet's first migration (RBM-F15). With N > 1 migrations on
   * the same bullet, this opens only the first — the badge's own `title` (see the template)
   * explains the rest are reachable from the Reserved Budget card, the documented fallback for
   * when the backend doesn't thread sibling migrations into `refs` (open question in RBM-F1;
   * `ReservedBudgetMigrationViewerResponseDto.refs` exists but its contents for this case were
   * not verified as part of this task — registering the divergence here rather than assuming).
   */
  protected openMigrationViewer(bullet: BulletListItem): void {
    const extraBudgetId = bullet.firstMigrationExtraBudgetId;
    if (!extraBudgetId) return;

    const walletId = this.selectedWallet()?.id ?? null;
    this.omegaViewerLauncher
      .open({ kind: 'RESERVED_BUDGET_MIGRATION', id: extraBudgetId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.mutated) this.reloadWalletContext(walletId);
      });
  }

  // Same 3-store fan-out createExtraBudget's own next handler already does below — factored out
  // so the viewer's revert path (which also moves money across Bullet/ExtraBudget/ReservedBudget)
  // doesn't duplicate that list. walletService.loadWallets() included because bullet/EB totals
  // are wallet-level aggregates here (unlike reserved-budget-page's reloadAfterMigration, which
  // deliberately excludes it — the RB's own balance isn't shown on this page at all).
  private reloadWalletContext(walletId: string | null): void {
    this.bulletService.loadByWalletId(walletId);
    this.walletService.loadWallets();
    this.extraBudgetService.loadByWalletId(walletId);
  }

  private updateBullet(
    walletId: string,
    bulletId: string,
    result: BulletEditDialogResult,
  ): void {
    this.bulletService
      .update(bulletId, {
        description: result.description,
        budget: result.budget,
        walletId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.walletService.loadWallets(),
        error: () => undefined,
      });
  }

  private deleteBullet(id: string): void {
    this.bulletService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.walletService.loadWallets(),
        error: () => undefined,
      });
  }

  private createExtraBudget(
    walletId: string,
    bulletId: string,
    result: ExtraBudgetAllocationDialogResult,
  ): void {
    this.extraBudgetService
      .create({
        description: result.description,
        walletId,
        amount: result.amount,
        allocations: [{ bulletId, amount: result.amount }],
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadWalletContext(walletId),
        error: () => undefined,
      });
  }

  private resetForm(): void {
    this.form.reset({ description: '', budget: 0 });
  }
}
