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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, of } from 'rxjs';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';
import { formatBrl } from '@shared/utils/currency';
import {
  ExpensePaymentStatus,
  ExpenseSortOrder,
  filterAndSortExpenses,
} from '@features/expense/expense-list.filters';
import { BulletService } from '@features/bullet/services/bullet.service';
import { PaymentService } from '@features/payment/services/payment.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { Payer } from '@features/payer/models/payer';
import { Share } from '@features/share/models/share';
import { ShareService } from '@features/share/services/share.service';

import {
  ExpenseDeleteDialogComponent,
  ExpenseDeleteDialogData,
} from '../../components/expense-delete-dialog/expense-delete-dialog.component';
import {
  ExpensePaymentDialogComponent,
  ExpensePaymentDialogResult,
} from '../../components/expense-payment-dialog/expense-payment-dialog.component';
import {
  InteractiveShareDialogComponent,
  InteractiveShareDialogData,
  InteractiveShareDialogResult,
} from '../../components/interactive-share-dialog/interactive-share-dialog.component';
import { ExpenseService } from '../../services/expense.service';

interface ExpenseListItem {
  readonly id: string;
  readonly name: string;
  readonly purchaseDate: string;
  readonly creditCardId: string | null;
  readonly creditCardLabel: string;
  readonly remainingValue: number;
  readonly cost: number;
  readonly remaining: number;
  readonly paid: number;
  readonly progress: number;
  readonly statusLabel: string;
  readonly bulletLabel: string;
  readonly activeShares: readonly Share[];
  readonly hasShare: boolean;
  readonly shareSummary: string;
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
  private readonly installmentService = inject(InstallmentService);
  private readonly shareService = inject(ShareService);

  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly payments = toSignal(this.paymentService.payments$, { initialValue: [] });
  private readonly shares = toSignal(this.shareService.shares$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly walletPayers = signal<readonly Payer[]>([]);

  protected readonly creditCards = toSignal(this.installmentService.creditCards$, {
    initialValue: [],
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
  protected readonly hasCreditCards = computed(() => this.creditCards().length > 0);
  protected readonly createExpenseBlockerMessage = computed(() => {
    if (!this.wallet()) {
      return 'Selecione uma wallet para cadastrar uma expense.';
    }

    if (!this.hasCreditCards()) {
      return 'Você precisa ter um cartão de crédito cadastrado para cadastrar expenses.';
    }

    return null;
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: [this.today(), Validators.required],
    creditCardId: ['', Validators.required],
    isInstallment: [false],
    installmentCharges: [0],
  });

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
    search: [''],
    creditCardId: [''],
    sortOrder: ['DATE_DESC' as ExpenseSortOrder],
    paymentStatus: ['ALL' as ExpensePaymentStatus],
    startDate: [''],
    endDate: [''],
  });

  protected readonly showInstallments = toSignal(
    this.form.controls.isInstallment.valueChanges,
    { initialValue: false },
  );
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  private readonly filtersValue = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.getRawValue(),
  });
  protected readonly canSubmitExpense = computed(() =>
    !!this.wallet() && this.hasCreditCards() && this.formStatus() === 'VALID' && !this.isSaving(),
  );

  protected readonly expenseItems = computed<readonly ExpenseListItem[]>(() => {
    const creditCardNameById = new Map(this.creditCards().map((card) => [card.id, card.name]));
    return this.expenses().map((expense) => {
      const payment = this.payments().find((p) => p.expenseId === expense.id);
      const bullet = payment
        ? this.bullets().find((candidate) => candidate.id === payment.bulletId)
        : null;
      const cost = Number(expense.cost);
      const remaining = Number(expense.remaining);
      const paid = Math.max(cost - remaining, 0);
      const progress = cost > 0 ? Math.min((paid / cost) * 100, 100) : 0;
      const creditCardId = expense.creditCardId ?? null;
      const activeShares = this.shares().filter(
        (share) =>
          share.sourceType === 'EXPENSE' &&
          share.sourceId === expense.id &&
          share.status === 'ACTIVE',
      );
      const shareSummary = activeShares
        .flatMap((share) => share.quotas)
        .map((quota) => `${quota.payerName}: ${formatBrl(Number(quota.amount))}`)
        .join(' · ');
      return {
        id: expense.id,
        name: expense.name,
        purchaseDate: expense.purchaseDate,
        creditCardId,
        creditCardLabel: creditCardId ? (creditCardNameById.get(creditCardId) ?? creditCardId) : '—',
        remainingValue: remaining,
        cost,
        remaining,
        paid,
        progress,
        statusLabel: remaining <= 0 ? 'PAID' : 'OPEN',
        bulletLabel: bullet?.description ?? '—',
        activeShares,
        hasShare: activeShares.length > 0,
        shareSummary,
      };
    });
  });

  protected readonly filteredExpenseItems = computed<readonly ExpenseListItem[]>(() =>
    filterAndSortExpenses(this.expenseItems(), this.filtersValue()),
  );

  protected readonly bulletOptions = computed<readonly BulletOption[]>(() =>
    this.bullets()
      .filter((b) => Number(b.remaining) > 0)
      .map((b) => ({
        id: b.id,
        description: b.description,
        remaining: formatBrl(Number(b.remaining)),
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
      // Load credit cards for the dropdown
      this.installmentService.loadByWalletId(walletId);
      this.shareService.loadAll();
      this.resetForm();
    });

    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.reloadWalletPayers(walletId);
    });
  }

  private reloadWalletPayers(walletId: string | null): void {
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
  }

  protected toggleInstallment(): void {
    const current = this.form.controls.isInstallment.value;
    this.form.controls.isInstallment.setValue(!current);

    if (!current) {
      // turning on: require installmentCharges >= 2
      this.form.controls.installmentCharges.setValidators([Validators.required, Validators.min(2)]);
    } else {
      // turning off: clear validators
      this.form.controls.installmentCharges.clearValidators();
      this.form.controls.installmentCharges.setValue(0);
    }
    this.form.controls.installmentCharges.updateValueAndValidity();
  }

  protected createExpense(): void {
    const wallet = this.selectedWallet();
    if (!wallet || !this.hasCreditCards() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const isInstallment = value.isInstallment;
    const charges = value.installmentCharges;

    this.expenseService
      .create({
        name: value.name.trim(),
        cost: value.cost,
        purchaseDate: value.purchaseDate,
        walletId: wallet.id,
        creditCardId: value.creditCardId,
        ...(isInstallment && charges >= 2
          ? { installment: true, installmentNumber: charges }
          : {}),
      })
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

  protected openShareDialog(expense: ExpenseListItem): void {
    const wallet = this.selectedWallet();
    // Backend allows only one active share per source — the row button is hidden once
    // expense.hasShare is true, but guard here too in case of a stale click.
    if (!wallet || expense.hasShare) return;

    this.dialog
      .open<InteractiveShareDialogComponent, InteractiveShareDialogData, InteractiveShareDialogResult>(
        InteractiveShareDialogComponent,
        {
          width: '32rem',
          maxWidth: 'calc(100vw - 2rem)',
          data: {
            walletId: wallet.id,
            expense: { id: expense.id, name: expense.name, cost: expense.cost, currency: 'BRL' },
            payers: this.walletPayers(),
          },
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          // Refresh authoritative state after a share is created. The share creates a
          // payment for the owner's portion server-side, reducing the expense's
          // `remaining`, so expense/payment must reload (same as payExpense). shareService
          // reloads via the owner-scoped GET /shares so the new share's `hasShare` badge
          // and the hidden split button are correct. A transient/new payer may also now
          // exist, so refresh payers too.
          const id = wallet.id;
          this.expenseService.loadByWalletId(id);
          this.paymentService.loadByWalletId(id);
          this.shareService.loadAll();
          this.reloadWalletPayers(id);
        }
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
    this.form.controls.installmentCharges.clearValidators();
    this.form.controls.installmentCharges.updateValueAndValidity();
    this.form.reset({
      name: '',
      cost: 0,
      purchaseDate: this.today(),
      creditCardId: '',
      isInstallment: false,
      installmentCharges: 0,
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
