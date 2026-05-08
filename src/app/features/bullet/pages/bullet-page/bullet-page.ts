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
import { WalletService } from '@features/wallet/services/wallet.service';

import { BulletService } from '../../services/bullet.service';
import {
  BulletDeleteDialogComponent,
  BulletDeleteDialogData,
} from '../../components/bullet-delete-dialog/bullet-delete-dialog.component';

interface BulletListItem {
  readonly id: string;
  readonly description: string;
  readonly budget: number;
  readonly remaining: number;
  readonly used: number;
  readonly progress: number;
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
  private readonly walletService = inject(WalletService);

  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.bulletService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.bulletService.saving$, { initialValue: false });
  protected readonly deletingBulletId = toSignal(this.bulletService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.bulletService.error$, { initialValue: null });

  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    budget: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly bulletItems = computed<readonly BulletListItem[]>(() =>
    this.bullets().map((bullet) => {
      const budget = Number(bullet.budget);
      const remaining = Number(bullet.remaining);
      const used = Math.max(budget - remaining, 0);
      const progress = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
      return { id: bullet.id, description: bullet.description, budget, remaining, used, progress };
    }),
  );

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
      this.bulletService.loadByWalletId(this.selectedWallet()?.id ?? null);
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

  private deleteBullet(id: string): void {
    this.bulletService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.walletService.loadWallets(),
        error: () => undefined,
      });
  }

  private resetForm(): void {
    this.form.reset({ description: '', budget: 0 });
  }
}
