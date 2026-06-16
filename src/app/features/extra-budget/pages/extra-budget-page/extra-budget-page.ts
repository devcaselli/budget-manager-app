import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { formatBrl } from '@shared/utils/currency';
import { BulletService } from '@features/bullet/services/bullet.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { ExtraBudgetAllocation } from '../../models/extra-budget';
import { ExtraBudgetService } from '../../services/extra-budget.service';

interface AllocationDraft {
  readonly bulletId: string;
  readonly bulletLabel: string;
  readonly amount: number;
}

interface ExtraBudgetListItem {
  readonly id: string;
  readonly description: string;
  readonly amount: number;
  readonly allocationLabel: string;
}

@Component({
  selector: 'app-extra-budget-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, MatIconModule, ReactiveFormsModule],
  templateUrl: './extra-budget-page.html',
  styleUrl: './extra-budget-page.scss',
})
export class ExtraBudgetPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly bulletService = inject(BulletService);
  private readonly extraBudgetService = inject(ExtraBudgetService);
  private readonly walletService = inject(WalletService);

  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly extraBudgets = toSignal(this.extraBudgetService.extraBudgets$, {
    initialValue: [],
  });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.extraBudgetService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.extraBudgetService.saving$, { initialValue: false });
  protected readonly deletingExtraBudgetId = toSignal(this.extraBudgetService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.extraBudgetService.error$, { initialValue: null });
  protected readonly allocations = signal<readonly AllocationDraft[]>([]);

  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    bulletId: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });
  private readonly descriptionValue = toSignal(this.form.controls.description.valueChanges, {
    initialValue: this.form.controls.description.getRawValue(),
  });

  protected readonly bulletOptions = computed(() => {
    const allocatedIds = new Set(this.allocations().map((allocation) => allocation.bulletId));

    return this.bullets()
      .filter((bullet) => !allocatedIds.has(bullet.id))
      .map((bullet) => ({
        id: bullet.id,
        description: bullet.description,
        budget: Number(bullet.budget),
        remaining: Number(bullet.remaining),
      }));
  });

  protected readonly totalAllocated = computed(() =>
    this.allocations().reduce((acc, allocation) => acc + allocation.amount, 0),
  );

  protected readonly activeExtraBudgets = computed<readonly ExtraBudgetListItem[]>(() => {
    const bulletById = new Map(this.bullets().map((bullet) => [bullet.id, bullet.description]));

    return this.extraBudgets()
      .filter((extraBudget) => !extraBudget.deleted)
      .map((extraBudget) => ({
        id: extraBudget.id,
        description: extraBudget.description,
        amount: Number(extraBudget.amount),
        allocationLabel: extraBudget.allocations
          .map((allocation) => {
            const label = bulletById.get(allocation.bulletId) ?? allocation.bulletId;
            return `${label} (${this.formatCurrency(Number(allocation.amount))})`;
          })
          .join(' · '),
      }));
  });

  protected readonly totalExtraBudget = computed(() =>
    this.activeExtraBudgets().reduce((acc, extraBudget) => acc + extraBudget.amount, 0),
  );

  protected readonly canSubmit = computed(() =>
    !!this.wallet()
    && this.allocations().length > 0
    && this.descriptionValue().trim().length > 0
    && this.descriptionValue().trim().length <= 120
    && !this.isSaving(),
  );

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.bulletService.loadByWalletId(walletId);
      this.extraBudgetService.loadByWalletId(walletId);
      this.resetForm();
    });
  }

  protected addAllocation(): void {
    if (this.form.controls.bulletId.invalid || this.form.controls.amount.invalid) {
      this.form.controls.bulletId.markAsTouched();
      this.form.controls.amount.markAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const bullet = this.bullets().find((candidate) => candidate.id === value.bulletId);
    if (!bullet) return;

    this.allocations.update((current) => [
      ...current,
      {
        bulletId: bullet.id,
        bulletLabel: bullet.description,
        amount: value.amount,
      },
    ]);
    this.form.patchValue({ bulletId: '', amount: 0 });
    this.form.controls.bulletId.markAsUntouched();
    this.form.controls.amount.markAsUntouched();
  }

  protected removeAllocation(bulletId: string): void {
    this.allocations.update((current) =>
      current.filter((allocation) => allocation.bulletId !== bulletId),
    );
  }

  protected createExtraBudget(): void {
    const wallet = this.selectedWallet();
    if (!wallet || !this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    const description = this.form.controls.description.getRawValue().trim();
    const allocations = this.allocations().map<ExtraBudgetAllocation>((allocation) => ({
      bulletId: allocation.bulletId,
      amount: allocation.amount,
    }));

    this.extraBudgetService
      .create({
        description,
        walletId: wallet.id,
        amount: this.totalAllocated(),
        allocations,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadWalletContext(),
        error: () => undefined,
      });
  }

  protected revertExtraBudget(id: string): void {
    this.extraBudgetService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadWalletContext(),
        error: () => undefined,
      });
  }

  private reloadWalletContext(): void {
    const walletId = this.selectedWallet()?.id ?? null;
    this.resetForm();
    this.extraBudgetService.loadByWalletId(walletId);
    this.bulletService.loadByWalletId(walletId);
    this.walletService.loadWallets();
  }

  private resetForm(): void {
    this.allocations.set([]);
    this.form.reset({ description: '', bulletId: '', amount: 0 });
  }

  private formatCurrency(value: number): string {
    return formatBrl(value);
  }
}
