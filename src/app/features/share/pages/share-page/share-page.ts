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
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { catchError, of } from 'rxjs';

import { ExpenseService } from '@features/expense/services/expense.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { Payer } from '@features/payer/models/payer';
import { Subscription } from '@features/subscription/models/subscription';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import {
  CreateShareRequest,
  Share,
  ShareQuotaMode,
  ShareSourceType,
} from '../../models/share';
import { ShareService } from '../../services/share.service';

interface SourceOption {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly currency: string;
  readonly meta: string;
}

interface ShareListItem {
  readonly id: string;
  readonly sourceLabel: string;
  readonly sourceType: ShareSourceType;
  readonly totalAmount: number;
  readonly ownerShare: number;
  readonly ownerRatioLabel: string;
  readonly currency: string;
  readonly status: string;
  readonly active: boolean;
  readonly quotasLabel: string;
  readonly paymentsCount: number;
  readonly createdAt: string;
  readonly revertedAt: string | null;
}

interface ShareQuotaIssue {
  readonly index: number;
  readonly message: string;
}

interface QuotaFormValue {
  readonly mode: ShareQuotaMode;
  readonly payerId: string;
  readonly transientName: string;
  readonly transientPaymentDate: string;
  readonly amount: number;
}

type QuotaFormGroup = FormGroup<{
  mode: FormControl<ShareQuotaMode>;
  payerId: FormControl<string>;
  transientName: FormControl<string>;
  transientPaymentDate: FormControl<string>;
  amount: FormControl<number>;
}>;

interface ShareFormValue {
  readonly sourceType: ShareSourceType;
  readonly sourceId: string;
  readonly totalAmount: number;
  readonly ownerShare: number;
  readonly quotas: QuotaFormValue[];
}

const SOURCE_LABEL: Record<ShareSourceType, string> = {
  EXPENSE: 'Expense',
  SUBSCRIPTION: 'Subscription',
  INSTALLMENT: 'Installment',
};

const QUOTA_MODE_OPTIONS: readonly { value: ShareQuotaMode; label: string }[] = [
  { value: 'EXISTING', label: 'Existing payer' },
  { value: 'TRANSIENT', label: 'Transient payer' },
];

@Component({
  selector: 'app-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, ReactiveFormsModule],
  templateUrl: './share-page.html',
  styleUrl: './share-page.scss',
})
export class SharePage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly expenseService = inject(ExpenseService);
  private readonly installmentService = inject(InstallmentService);
  private readonly shareService = inject(ShareService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly walletService = inject(WalletService);

  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly installments = toSignal(this.installmentService.installments$, { initialValue: [] });
  private readonly shares = toSignal(this.shareService.shares$, { initialValue: [] });
  private readonly subscriptions = toSignal(this.subscriptionService.subscriptions$, {
    initialValue: [],
  });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly walletPayers = signal<readonly Payer[]>([]);
  protected readonly wallet = this.selectedWallet;

  protected readonly isLoading = toSignal(this.shareService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.shareService.saving$, { initialValue: false });
  protected readonly revertingId = toSignal(this.shareService.reverting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.shareService.error$, { initialValue: null });
  protected readonly quotaModeOptions = QUOTA_MODE_OPTIONS;
  protected readonly existingPayers = computed<readonly Payer[]>(() =>
    this.sourceTypeValue() === 'EXPENSE'
      ? this.walletPayers()
      : this.walletPayers().filter((payer) => payer.type !== 'TRANSIENT'),
  );

  protected readonly form = this.formBuilder.nonNullable.group({
    sourceType: ['EXPENSE' as ShareSourceType, Validators.required],
    sourceId: ['', Validators.required],
    totalAmount: [0, [Validators.required, Validators.min(0.01)]],
    ownerShare: [0, [Validators.required, Validators.min(0)]],
    quotas: this.formBuilder.array([this.createQuotaGroup()]),
  });

  private readonly sourceTypeValue = toSignal(this.form.controls.sourceType.valueChanges, {
    initialValue: this.form.controls.sourceType.getRawValue(),
  });
  private readonly sourceIdValue = toSignal(this.form.controls.sourceId.valueChanges, {
    initialValue: this.form.controls.sourceId.getRawValue(),
  });
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue() as ShareFormValue,
  });
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  protected readonly sourceOptions = computed<readonly SourceOption[]>(() => {
    switch (this.sourceTypeValue()) {
      case 'EXPENSE':
        return this.expenses().map((expense) => ({
          id: expense.id,
          label: expense.name,
          amount: Number(expense.cost),
          currency: 'BRL',
          meta: `remaining ${this.fmt(Number(expense.remaining))}`,
        }));
      case 'INSTALLMENT':
        return this.installments().map((installment) => ({
          id: installment.id,
          label: installment.description,
          amount: Number(installment.effectiveOriginalValue),
          currency: installment.currency,
          meta: `${installment.installmentNumber}x · ${this.fmt(installment.effectiveInstallmentValue, installment.currency)}/cycle`,
        }));
      case 'SUBSCRIPTION':
        return this.subscriptions()
          .filter((subscription) => this.isSubscriptionApplicable(subscription, this.currentMonth()))
          .map((subscription) => {
            const currentAmount = this.resolveSubscriptionAmount(subscription, this.currentMonth());

            return {
              id: subscription.id,
              label: subscription.description,
              amount: currentAmount,
              currency: subscription.currency,
              meta: `${subscription.state.toLowerCase()} · ${this.fmt(currentAmount, subscription.currency)}`,
            };
          });
    }
  });

  protected readonly selectedSource = computed<SourceOption | null>(() =>
    this.sourceOptions().find((option) => option.id === this.sourceIdValue()) ?? null,
  );

  protected readonly shareItems = computed<readonly ShareListItem[]>(() => {
    const walletId = this.selectedWallet()?.id;
    if (!walletId) {
      return [];
    }

    return this.shares()
      .filter((share) => share.walletId === walletId)
      .map((share) => this.toShareListItem(share))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  protected readonly activeShareCount = computed(
    () => this.shareItems().filter((share) => share.active).length,
  );
  protected readonly revertedShareCount = computed(
    () => this.shareItems().filter((share) => !share.active).length,
  );
  protected readonly sharedTotal = computed(() =>
    this.shareItems().reduce((sum, share) => sum + share.totalAmount, 0),
  );
  protected readonly quotasTotal = computed(() =>
    this.shareFormValue().quotas.reduce(
      (sum, quota) => sum + Number(quota?.amount || 0),
      0,
    ),
  );
  protected readonly unassignedAmount = computed(() =>
    Number((this.totalAmountValue() - this.ownerShareValue() - this.quotasTotal()).toFixed(2)),
  );
  protected readonly canSubmit = computed(() => {
    const wallet = this.selectedWallet();
    const source = this.selectedSource();
    return !!wallet
      && !!source
      && this.formStatus() === 'VALID'
      && this.unassignedAmount() === 0
      && this.isQuotaStateValid();
  });
  protected readonly transientQuotaAllowed = computed(
    () => this.sourceTypeValue() === 'EXPENSE',
  );
  protected readonly submitBlockers = computed<readonly string[]>(() => {
    const blockers: string[] = [];
    const wallet = this.selectedWallet();
    const source = this.selectedSource();

    if (!wallet) {
      blockers.push('Select a wallet to create the share.');
    }

    if (!source) {
      blockers.push('Choose a valid source for the share.');
    }

    if (this.form.controls.ownerShare.invalid) {
      blockers.push('Owner share deve ser zero ou maior.');
    }

    if (this.totalAmountValue() <= 0) {
      blockers.push('The source must have a total amount greater than zero.');
    }

    const delta = this.unassignedAmount();
    if (delta !== 0) {
      blockers.push(
        `The share must balance: adjust owner share and quotas until the delta is R$ 0,00. Current delta: ${this.fmt(delta)}`,
      );
    }

    for (const issue of this.quotaIssues()) {
      blockers.push(`Quota ${issue.index}: ${issue.message}`);
    }

    return blockers;
  });

  constructor() {
    this.subscriptionService.loadSubscriptions();

    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.expenseService.loadByWalletId(walletId);
      this.installmentService.loadByWalletId(walletId);
      this.shareService.load();

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

    effect(() => {
      const options = this.sourceOptions();
      const currentId = this.sourceIdValue();
      if (!options.length) {
        if (currentId) {
          this.form.controls.sourceId.setValue('');
        }
        this.form.controls.totalAmount.setValue(0, { emitEvent: false });
        return;
      }

      if (!options.some((option) => option.id === currentId)) {
        this.form.controls.sourceId.setValue(options[0]!.id);
      }
    });

    effect(() => {
      const source = this.selectedSource();
      const amount = Number(source?.amount ?? 0);
      this.form.controls.totalAmount.setValue(amount, { emitEvent: false });

      if (source && this.quotas.length === 1 && this.quotaAt(0).controls.amount.getRawValue() === 0) {
        this.quotaAt(0).controls.amount.setValue(amount);
      }
    });

    effect(() => {
      if (this.transientQuotaAllowed()) {
        return;
      }

      this.quotaControls().forEach((quota) => {
        if (quota.controls.mode.getRawValue() === 'TRANSIENT') {
          quota.controls.mode.setValue('EXISTING');
        }
      });
    });

    effect(() => {
      const allowedPayerIds = new Set(this.existingPayers().map((payer) => payer.id));

      this.quotaControls().forEach((quota) => {
        if (quota.controls.mode.getRawValue() !== 'EXISTING') {
          return;
        }

        const payerId = quota.controls.payerId.getRawValue();
        if (payerId && !allowedPayerIds.has(payerId)) {
          quota.controls.payerId.setValue('');
        }
      });
    });
  }

  protected quotaControls(): readonly QuotaFormGroup[] {
    return this.quotas.controls as unknown as readonly QuotaFormGroup[];
  }

  protected addQuota(): void {
    this.quotas.push(this.createQuotaGroup());
  }

  protected removeQuota(index: number): void {
    if (this.quotas.length === 1) {
      this.quotas.at(0).reset({
        mode: 'EXISTING',
        payerId: '',
        transientName: '',
        transientPaymentDate: this.today(),
        amount: 0,
      });
      return;
    }

    this.quotas.removeAt(index);
  }

  protected isTransientQuota(index: number): boolean {
    return this.quotaAt(index).controls.mode.getRawValue() === 'TRANSIENT';
  }

  protected quotaModeDisabled(mode: ShareQuotaMode): boolean {
    return mode === 'TRANSIENT' && !this.transientQuotaAllowed();
  }

  protected createShare(): void {
    const wallet = this.selectedWallet();
    const source = this.selectedSource();

    if (!wallet || !source || !this.canSubmit()) {
      this.form.markAllAsTouched();
      this.quotaControls().forEach((quota) => quota.markAllAsTouched());
      return;
    }

    const raw = this.form.getRawValue() as ShareFormValue;
    const request: CreateShareRequest = {
      walletId: wallet.id,
      sourceType: raw.sourceType,
      sourceId: raw.sourceId,
      totalAmount: Number(raw.totalAmount),
      currency: source.currency,
      ownerShare: Number(raw.ownerShare),
      quotas: raw.quotas.map((quota) =>
        quota.mode === 'TRANSIENT'
          ? {
              transient_: {
                name: quota.transientName.trim(),
                ...(quota.transientPaymentDate ? { paymentDate: quota.transientPaymentDate } : {}),
              },
              amount: Number(quota.amount),
            }
          : {
              payerId: quota.payerId,
              amount: Number(quota.amount),
            },
      ),
    };

    this.shareService
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.resetForm(),
        error: () => undefined,
      });
  }

  protected revertShare(id: string): void {
    this.shareService
      .revert(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  protected payerName(payerId: string): string {
    return this.walletPayers().find((payer) => payer.id === payerId)?.name ?? payerId.slice(0, 8);
  }

  protected totalAmountValue(): number {
    return Number(this.shareFormValue().totalAmount || 0);
  }

  protected ownerShareValue(): number {
    return Number(this.shareFormValue().ownerShare || 0);
  }

  private toShareListItem(share: Share): ShareListItem {
    return {
      id: share.id,
      sourceLabel: this.describeSource(share.sourceType, share.sourceId),
      sourceType: share.sourceType,
      totalAmount: Number(share.totalAmount),
      ownerShare: Number(share.ownerShare),
      ownerRatioLabel: `${Math.round(Number(share.ownerRatio) * 100)}% owner`,
      currency: share.currency,
      status: share.status === 'ACTIVE' ? 'Active' : 'Reverted',
      active: share.status === 'ACTIVE',
      quotasLabel: share.quotas
        .map((quota) => `${quota.payerName || this.payerName(quota.payerId)} · ${this.fmt(Number(quota.amount), share.currency)}`)
        .join(' / '),
      paymentsCount: share.paymentIds.length,
      createdAt: this.fmtDateTime(share.createdAt),
      revertedAt: share.revertedAt ? this.fmtDateTime(share.revertedAt) : null,
    };
  }

  private describeSource(sourceType: ShareSourceType, sourceId: string): string {
    if (sourceType === 'EXPENSE') {
      return this.expenses().find((expense) => expense.id === sourceId)?.name ?? sourceId.slice(0, 8);
    }

    if (sourceType === 'INSTALLMENT') {
      return this.installments().find((installment) => installment.id === sourceId)?.description
        ?? sourceId.slice(0, 8);
    }

    return this.subscriptions().find((subscription) => subscription.id === sourceId)?.description
      ?? sourceId.slice(0, 8);
  }

  private resolveSubscriptionAmount(subscription: Subscription, targetMonth: string): number {
    const versions = [...subscription.versions]
      .filter((version) => version.effectiveMonth <= targetMonth)
      .sort((left, right) => right.effectiveMonth.localeCompare(left.effectiveMonth));

    return Number(versions.at(0)?.amount ?? 0);
  }

  private isSubscriptionApplicable(subscription: Subscription, targetMonth: string): boolean {
    return subscription.startMonth <= targetMonth
      && (subscription.endMonth === null || targetMonth < subscription.endMonth);
  }

  private isQuotaStateValid(): boolean {
    return this.quotaIssues().length === 0;
  }

  private createQuotaGroup(): QuotaFormGroup {
    return this.formBuilder.nonNullable.group({
      mode: ['EXISTING' as ShareQuotaMode, Validators.required],
      payerId: [''],
      transientName: [''],
      transientPaymentDate: [this.today()],
      amount: [0, [Validators.required, Validators.min(0.01)]],
    });
  }

  private resetForm(): void {
    this.form.controls.ownerShare.setValue(0);
    while (this.quotas.length > 1) {
      this.quotas.removeAt(this.quotas.length - 1);
    }
    this.quotas.at(0).reset({
      mode: 'EXISTING',
      payerId: '',
      transientName: '',
      transientPaymentDate: this.today(),
      amount: this.totalAmountValue(),
    });
  }

  private fmt(value: number, currency = 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }

  private fmtDateTime(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  protected readonly sourceLabel = SOURCE_LABEL;
  protected readonly payers = this.walletPayers;

  private shareFormValue(): ShareFormValue {
    return this.formValue() as ShareFormValue;
  }

  private quotaIssues(): ShareQuotaIssue[] {
    return this.shareFormValue().quotas.flatMap((quota, index) => {
      const issues: ShareQuotaIssue[] = [];
      const amount = Number(quota?.amount || 0);

      if (amount <= 0) {
        issues.push({ index: index + 1, message: 'the quota amount must be greater than zero.' });
      }

      if (quota?.mode === 'TRANSIENT') {
        if (!this.transientQuotaAllowed()) {
          issues.push({
            index: index + 1,
            message: 'transient payer can only be used in expense shares.',
          });
        }

        if (quota.transientName.trim().length === 0) {
          issues.push({ index: index + 1, message: 'enter the transient payer name.' });
        }
      } else if (quota?.payerId.trim().length === 0) {
        issues.push({ index: index + 1, message: 'select an existing payer.' });
      } else if (!this.existingPayers().some((payer) => payer.id === quota.payerId)) {
        issues.push({
          index: index + 1,
          message: 'the selected existing payer is not allowed for this share source.',
        });
      }

      return issues;
    });
  }

  private quotaAt(index: number): QuotaFormGroup {
    return this.quotas.at(index) as QuotaFormGroup;
  }

  private get quotas(): FormArray<QuotaFormGroup> {
    return this.form.controls.quotas as unknown as FormArray<QuotaFormGroup>;
  }
}
