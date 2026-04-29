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
import { MatSelectModule } from '@angular/material/select';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

import { BulletService } from '@features/bullet/services/bullet.service';
import { ExpenseService } from '@features/expense/services/expense.service';
import { WalletService } from '@features/wallet/services/wallet.service';

import { PaymentService } from '../../services/payment.service';

interface ExpenseOption {
  readonly id: string;
  readonly name: string;
  readonly remaining: string;
}

interface BulletOption {
  readonly id: string;
  readonly description: string;
  readonly remaining: string;
}

interface PaymentListItem {
  readonly id: string;
  readonly amount: string;
  readonly paymentDate: string;
  readonly details: string;
  readonly expenseId: string;
  readonly bulletId: string;
}

@Component({
  selector: 'app-payment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    PageHeaderComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './payment-page.html',
  styleUrl: './payment-page.scss',
})
export class PaymentPage {
  private readonly destroyRef = inject(DestroyRef);
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
  protected readonly isLoading = toSignal(this.paymentService.loading$, { initialValue: false });
  protected readonly isPaying = toSignal(this.paymentService.paying$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.paymentService.error$, { initialValue: null });
  protected readonly canDeletePayments = this.paymentService.canDeletePayments;

  protected readonly form = this.formBuilder.nonNullable.group({
    expenseId: ['', Validators.required],
    bulletId: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    details: [''],
  });

  protected readonly expenseOptions = computed<readonly ExpenseOption[]>(() =>
    this.expenses()
      .filter((expense) => Number(expense.remaining) > 0)
      .map((expense) => ({
        id: expense.id,
        name: expense.name,
        remaining: this.formatCurrency(Number(expense.remaining)),
      })),
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

  protected readonly paymentItems = computed<readonly PaymentListItem[]>(() =>
    this.payments().map((payment) => ({
      id: payment.id,
      amount: this.formatCurrency(Number(payment.amount)),
      paymentDate: this.formatDateTime(payment.paymentDate),
      details: payment.details || '-',
      expenseId: payment.expenseId,
      bulletId: payment.bulletId,
    })),
  );

  constructor() {
    effect(() => {
      this.reloadWalletData();
      this.resetForm();
    });
  }

  protected refreshPayments(): void {
    this.reloadWalletData();
  }

  protected payExpense(): void {
    const wallet = this.selectedWallet();

    if (!wallet || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.paymentService
      .payExpense({
        walletId: wallet.id,
        body: {
          payment: {
            amount: value.amount,
            currency: 'BRL',
            paymentDate: new Date().toISOString(),
            details: value.details.trim() || null,
          },
          bulletId: value.bulletId,
          expenseId: value.expenseId,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resetForm();
          this.reloadWalletData();
        },
        error: () => undefined,
      });
  }

  protected deletePayment(): void {
    // Prepared for DELETE /payments/{id}. Keep disabled until the backend exposes it.
  }

  private reloadWalletData(): void {
    const walletId = this.selectedWallet()?.id ?? null;

    this.bulletService.loadByWalletId(walletId);
    this.expenseService.loadByWalletId(walletId);
    this.paymentService.loadByWalletId(walletId);
  }

  private resetForm(): void {
    this.form.reset({
      expenseId: '',
      bulletId: '',
      amount: 0,
      details: '',
    });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }
}
