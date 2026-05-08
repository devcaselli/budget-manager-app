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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';
import { BulletService } from '@features/bullet/services/bullet.service';
import { PaymentService } from '@features/payment/services/payment.service';
import { WalletService } from '@features/wallet/services/wallet.service';

import {
  ExpenseDeleteDialogComponent,
  ExpenseDeleteDialogData,
} from '../../components/expense-delete-dialog/expense-delete-dialog.component';
import {
  ExpensePaymentDialogComponent,
  ExpensePaymentDialogResult,
} from '../../components/expense-payment-dialog/expense-payment-dialog.component';
import { ExpenseService } from '../../services/expense.service';

interface ExpenseListItem {
  readonly id: string;
  readonly name: string;
  readonly purchaseDate: string;
  readonly remainingValue: number;
  readonly cost: number;
  readonly remaining: number;
  readonly paid: number;
  readonly progress: number;
  readonly statusLabel: string;
  readonly bulletLabel: string;
}

interface BulletOption {
  readonly id: string;
  readonly description: string;
  readonly remaining: string;
}

@Component({
  selector: 'app-expense-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrDatePipe, BrlCurrencyPipe, MatIconModule, ReactiveFormsModule],
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
  private readonly payments = toSignal(this.paymentService.payments$, { initialValue: [] });
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
      const payment = this.payments().find((p) => p.expenseId === expense.id);
      const bullet = payment
        ? this.bullets().find((candidate) => candidate.id === payment.bulletId)
        : null;
      const cost = Number(expense.cost);
      const remaining = Number(expense.remaining);
      const paid = Math.max(cost - remaining, 0);
      const progress = cost > 0 ? Math.min((paid / cost) * 100, 100) : 0;
      return {
        id: expense.id,
        name: expense.name,
        purchaseDate: expense.purchaseDate,
        remainingValue: remaining,
        cost,
        remaining,
        paid,
        progress,
        statusLabel: remaining <= 0 ? 'PAID' : 'OPEN',
        bulletLabel: bullet?.description ?? '—',
      };
    }),
  );

  protected readonly bulletOptions = computed<readonly BulletOption[]>(() =>
    this.bullets()
      .filter((b) => Number(b.remaining) > 0)
      .map((b) => ({
        id: b.id,
        description: b.description,
        remaining: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(b.remaining)),
      })),
  );

  protected readonly totalCost = computed(() =>
    this.expenses().reduce((acc, e) => acc + Number(e.cost), 0),
  );

  protected readonly totalOpen = computed(() =>
    this.expenses().reduce((acc, e) => acc + Number(e.remaining), 0),
  );

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.bulletService.loadByWalletId(walletId);
      this.expenseService.loadByWalletId(walletId);
      this.paymentService.loadByWalletId(walletId);
      this.resetForm();
    });
  }

  protected createExpense(): void {
    const wallet = this.selectedWallet();
    if (!wallet || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.expenseService
      .create({ name: value.name.trim(), cost: value.cost, purchaseDate: value.purchaseDate, walletId: wallet.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.resetForm(), error: () => undefined });
  }

  protected openPaymentDialog(expense: ExpenseListItem): void {
    const wallet = this.selectedWallet();
    if (!wallet || expense.remainingValue <= 0 || this.bulletOptions().length === 0) return;

    this.dialog
      .open<
        ExpensePaymentDialogComponent,
        { expense: ExpenseListItem; bullets: readonly BulletOption[] },
        ExpensePaymentDialogResult
      >(ExpensePaymentDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: { expense, bullets: this.bulletOptions() },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.payExpense(wallet.id, expense.id, result);
      });
  }

  protected onDeleteClick(expense: ExpenseListItem): void {
    this.dialog
      .open<ExpenseDeleteDialogComponent, ExpenseDeleteDialogData, boolean>(
        ExpenseDeleteDialogComponent,
        {
          width: '32rem',
          maxWidth: 'calc(100vw - 2rem)',
          data: { expenseName: expense.name, cost: expense.cost },
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.deleteExpense(expense.id);
      });
  }

  private deleteExpense(id: string): void {
    this.expenseService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => undefined, error: () => undefined });
  }

  private payExpense(walletId: string, expenseId: string, payment: ExpensePaymentDialogResult): void {
    this.paymentService
      .payExpense({
        walletId,
        body: {
          payment: { amount: payment.amount, currency: 'BRL', paymentDate: new Date().toISOString(), details: payment.details },
          bulletId: payment.bulletId,
          expenseId,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const id = this.selectedWallet()?.id ?? null;
          this.bulletService.loadByWalletId(id);
          this.expenseService.loadByWalletId(id);
          this.paymentService.loadByWalletId(id);
        },
        error: () => undefined,
      });
  }

  private resetForm(): void {
    this.form.reset({ name: '', cost: 0, purchaseDate: this.today() });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
