import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { BulletService } from '@features/bullet/services/bullet.service';
import { ExpenseService } from '@features/expense/services/expense.service';
import { Payer } from '@features/payer/models/payer';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

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
  readonly amountRaw: number;
  readonly paymentDate: string;
  readonly kind: string;
  readonly kindTone: 'normal' | 'shared' | 'reversal';
  readonly details: string;
  readonly expenseId: string | null;
  readonly bulletId: string | null;
  readonly expenseName: string;
  readonly bulletName: string;
  readonly payerName: string;
  readonly shareLabel: string;
  readonly reversalLabel: string;
}

@Component({
  selector: 'app-payment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, ReactiveFormsModule],
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
  private readonly walletPayers = signal<readonly Payer[]>([]);

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.paymentService.loading$, { initialValue: false });
  protected readonly isPaying = toSignal(this.paymentService.paying$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.paymentService.error$, { initialValue: null });

  protected readonly form = this.formBuilder.nonNullable.group({
    expenseId: ['', Validators.required],
    bulletId: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    details: [''],
  });

  protected readonly expenseOptions = computed<readonly ExpenseOption[]>(() =>
    this.expenses()
      .filter((e) => Number(e.remaining) > 0)
      .map((e) => ({
        id: e.id,
        name: e.name,
        remaining: this.fmt(Number(e.remaining)),
      })),
  );

  protected readonly bulletOptions = computed<readonly BulletOption[]>(() =>
    this.bullets()
      .filter((b) => Number(b.remaining) > 0)
      .map((b) => ({
        id: b.id,
        description: b.description,
        remaining: this.fmt(Number(b.remaining)),
      })),
  );

  protected readonly paymentItems = computed<readonly PaymentListItem[]>(() =>
    this.payments().map((p) => {
      const expense = this.expenses().find((candidate) => candidate.id === p.expenseId);
      const bullet = this.bullets().find((candidate) => candidate.id === p.bulletId);
      const payer = this.walletPayers().find((candidate) => candidate.id === p.payerId);

      return {
        id: p.id,
        amount: this.fmt(Number(p.amount)),
        amountRaw: Number(p.amount),
        paymentDate: new Intl.DateTimeFormat('en-US', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(p.paymentDate)),
        kind: p.reversal ? 'Reversal' : p.kind === 'SHARED' ? 'Shared' : 'Normal',
        kindTone: p.reversal ? 'reversal' : p.kind === 'SHARED' ? 'shared' : 'normal',
        details: p.details || '—',
        expenseId: p.expenseId,
        bulletId: p.bulletId,
        expenseName: expense?.name ?? (p.expenseId ? p.expenseId.slice(0, 8) : '—'),
        bulletName: bullet?.description ?? (p.bulletId ? p.bulletId.slice(0, 8) : '—'),
        payerName: payer?.name ?? (p.payerId ? p.payerId.slice(0, 8) : 'Owner flow'),
        shareLabel: p.shareId ? p.shareId.slice(0, 8) : '—',
        reversalLabel: p.reversedPaymentId ? p.reversedPaymentId.slice(0, 8) : '—',
      };
    }),
  );

  protected readonly totalSettled = computed(() =>
    this.payments().reduce((acc, p) => acc + Number(p.amount), 0),
  );

  constructor() {
    effect(() => {
      this.reloadWalletData();
      this.resetForm();
    });

    effect(() => {
      const walletId = this.selectedWallet()?.id;
      if (!walletId) {
        this.walletPayers.set([]);
        return;
      }

      this.walletService
        .findPayersByWalletId(walletId)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of([])),
        )
        .subscribe((payers) => this.walletPayers.set(payers));
    });
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

  private reloadWalletData(): void {
    const walletId = this.selectedWallet()?.id ?? null;
    this.bulletService.loadByWalletId(walletId);
    this.expenseService.loadByWalletId(walletId);
    this.paymentService.loadByWalletId(walletId);
  }

  private resetForm(): void {
    this.form.reset({ expenseId: '', bulletId: '', amount: 0, details: '' });
  }

  private fmt(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
}
