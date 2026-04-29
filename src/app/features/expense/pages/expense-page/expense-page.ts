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

import { ExpenseService } from '../../services/expense.service';

interface ExpenseListItem {
  readonly id: string;
  readonly name: string;
  readonly cost: string;
  readonly remaining: string;
  readonly paid: string;
  readonly purchaseDate: string;
  readonly progress: number;
}

@Component({
  selector: 'app-expense-page',
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
  templateUrl: './expense-page.html',
  styleUrl: './expense-page.scss',
})
export class ExpensePage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly expenseService = inject(ExpenseService);
  private readonly walletService = inject(WalletService);
  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.expenseService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.expenseService.saving$, { initialValue: false });
  protected readonly deletingExpenseId = toSignal(this.expenseService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.expenseService.error$, { initialValue: null });

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: [this.today(), Validators.required],
  });

  protected readonly expenseItems = computed<readonly ExpenseListItem[]>(() =>
    this.expenses().map((expense) => {
      const cost = Number(expense.cost);
      const remaining = Number(expense.remaining);
      const paid = Math.max(cost - remaining, 0);
      const progress = cost > 0 ? Math.min((paid / cost) * 100, 100) : 0;

      return {
        id: expense.id,
        name: expense.name,
        cost: this.formatCurrency(cost),
        remaining: this.formatCurrency(remaining),
        paid: this.formatCurrency(paid),
        purchaseDate: this.formatDate(expense.purchaseDate),
        progress,
      };
    }),
  );

  constructor() {
    effect(() => {
      this.expenseService.loadByWalletId(this.selectedWallet()?.id ?? null);
      this.resetForm();
    });
  }

  protected refreshExpenses(): void {
    this.expenseService.loadByWalletId(this.selectedWallet()?.id ?? null);
  }

  protected createExpense(): void {
    const wallet = this.selectedWallet();

    if (!wallet || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.expenseService
      .create({
        name: value.name.trim(),
        cost: value.cost,
        purchaseDate: value.purchaseDate,
        walletId: wallet.id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.resetForm(),
        error: () => undefined,
      });
  }

  protected deleteExpense(id: string): void {
    this.expenseService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => undefined,
        error: () => undefined,
      });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
  }

  private resetForm(): void {
    this.form.reset({
      name: '',
      cost: 0,
      purchaseDate: this.today(),
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
