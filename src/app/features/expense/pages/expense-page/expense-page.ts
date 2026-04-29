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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

import { BulletService } from '@features/bullet/services/bullet.service';
import { PaymentService } from '@features/payment/services/payment.service';
import { WalletService } from '@features/wallet/services/wallet.service';

import {
  ExpensePaymentDialogComponent,
  ExpensePaymentDialogResult,
} from '../../components/expense-payment-dialog/expense-payment-dialog.component';
import { ExpenseService } from '../../services/expense.service';

interface ExpenseListItem {
  readonly id: string;
  readonly name: string;
  readonly remainingValue: number;
  readonly cost: string;
  readonly remaining: string;
  readonly paid: string;
  readonly purchaseDate: string;
  readonly progress: number;
}

interface BulletOption {
  readonly id: string;
  readonly description: string;
  readonly remaining: string;
}

@Component({
  selector: 'app-expense-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
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
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly bulletService = inject(BulletService);
  private readonly expenseService = inject(ExpenseService);
  private readonly paymentService = inject(PaymentService);
  private readonly walletService = inject(WalletService);
  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.expenseService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.expenseService.saving$, { initialValue: false });
  protected readonly isPaying = toSignal(this.paymentService.paying$, { initialValue: false });
  protected readonly deletingExpenseId = toSignal(this.expenseService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.expenseService.error$, { initialValue: null });
  protected readonly paymentErrorMessage = toSignal(this.paymentService.error$, {
    initialValue: null,
  });

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
        remainingValue: remaining,
        cost: this.formatCurrency(cost),
        remaining: this.formatCurrency(remaining),
        paid: this.formatCurrency(paid),
        purchaseDate: this.formatDate(expense.purchaseDate),
        progress,
      };
    }),
  );

  protected readonly bulletOptions = computed<readonly BulletOption[]>(() =>
    this.bullets()
      .filter((bullet) => Number(bullet.remaining) > 0)
      .map((bullet) => ({
        id: bullet.id,
        description: bullet.description,
        remaining: this.formatCurrency(Number(bullet.remaining)),
      })),
  );

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;

      this.bulletService.loadByWalletId(walletId);
      this.expenseService.loadByWalletId(walletId);
      this.resetForm();
    });
  }

  protected refreshExpenses(): void {
    this.reloadWalletData();
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

  protected openPaymentDialog(expense: ExpenseListItem): void {
    const wallet = this.selectedWallet();

    if (!wallet || expense.remainingValue <= 0 || this.bulletOptions().length === 0) {
      return;
    }

    this.dialog
      .open<
        ExpensePaymentDialogComponent,
        {
          expense: ExpenseListItem;
          bullets: readonly BulletOption[];
        },
        ExpensePaymentDialogResult
      >(ExpensePaymentDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: {
          expense,
          bullets: this.bulletOptions(),
        },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.payExpense(wallet.id, expense.id, result);
        }
      });
  }

  private payExpense(
    walletId: string,
    expenseId: string,
    payment: ExpensePaymentDialogResult,
  ): void {
    this.paymentService
      .payExpense({
        walletId,
        body: {
          payment: {
            amount: payment.amount,
            currency: 'BRL',
            paymentDate: new Date().toISOString(),
            details: payment.details,
          },
          bulletId: payment.bulletId,
          expenseId,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadWalletData(),
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

  private reloadWalletData(): void {
    const walletId = this.selectedWallet()?.id ?? null;

    this.bulletService.loadByWalletId(walletId);
    this.expenseService.loadByWalletId(walletId);
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
