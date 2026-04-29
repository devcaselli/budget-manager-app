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
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

import { WalletService } from '@features/wallet/services/wallet.service';

import { BulletService } from '../../services/bullet.service';

interface BulletListItem {
  readonly id: string;
  readonly description: string;
  readonly budget: string;
  readonly remaining: string;
  readonly used: string;
  readonly progress: number;
}

@Component({
  selector: 'app-bullet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    PageHeaderComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './bullet-page.html',
  styleUrl: './bullet-page.scss',
})
export class BulletPage {
  private readonly destroyRef = inject(DestroyRef);
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

      return {
        id: bullet.id,
        description: bullet.description,
        budget: this.formatCurrency(budget),
        remaining: this.formatCurrency(remaining),
        used: this.formatCurrency(used),
        progress,
      };
    }),
  );

  constructor() {
    effect(() => {
      this.bulletService.loadByWalletId(this.selectedWallet()?.id ?? null);
      this.resetForm();
    });
  }

  protected refreshBullets(): void {
    this.bulletService.loadByWalletId(this.selectedWallet()?.id ?? null);
  }

  protected createBullet(): void {
    const wallet = this.selectedWallet();

    if (!wallet || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.bulletService
      .create({
        description: value.description.trim(),
        budget: value.budget,
        walletId: wallet.id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resetForm();
          this.walletService.loadWallets();
        },
        error: () => undefined,
      });
  }

  protected deleteBullet(id: string): void {
    this.bulletService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.walletService.loadWallets(),
        error: () => undefined,
      });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private resetForm(): void {
    this.form.reset({
      description: '',
      budget: 0,
    });
  }
}
