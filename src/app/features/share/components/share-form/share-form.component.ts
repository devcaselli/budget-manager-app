import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  output,
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
  ShareSplitMode,
} from '../../models/share';
import { ShareService } from '../../services/share.service';

interface SourceOption {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly currency: string;
  readonly meta: string;
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
  readonly percent: number;
}

type QuotaFormGroup = FormGroup<{
  mode: FormControl<ShareQuotaMode>;
  payerId: FormControl<string>;
  transientName: FormControl<string>;
  transientPaymentDate: FormControl<string>;
  amount: FormControl<number>;
  percent: FormControl<number>;
}>;

interface ShareFormValue {
  readonly sourceType: ShareSourceType;
  readonly sourceId: string;
  readonly totalAmount: number;
  readonly ownerShare: number;
  readonly splitMode: ShareSplitMode;
  readonly quotas: QuotaFormValue[];
}

const QUOTA_MODE_OPTIONS: readonly { value: ShareQuotaMode; label: string }[] = [
  { value: 'EXISTING', label: 'Existing payer' },
  { value: 'TRANSIENT', label: 'Transient payer' },
];

/** Rounds to 2 decimals the same way the design's `recalc()`/`createShare()` do
 *  (`Math.round`-free, plain `toFixed`) — see share.model's `ShareSplitMode` doc for
 *  why no last-cent adjustment happens here. */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

@Component({
  selector: 'app-share-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, ReactiveFormsModule],
  templateUrl: './share-form.component.html',
  styleUrl: './share-form.component.scss',
})
export class ShareFormComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly expenseService = inject(ExpenseService);
  private readonly installmentService = inject(InstallmentService);
  private readonly shareService = inject(ShareService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly walletService = inject(WalletService);

  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly installments = toSignal(this.installmentService.allInstallments$, { initialValue: [] });
  private readonly shares = toSignal(this.shareService.shares$, { initialValue: [] });
  private readonly subscriptions = toSignal(this.subscriptionService.subscriptions$, {
    initialValue: [],
  });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly walletPayers = signal<readonly Payer[]>([]);

  /** Emits the created Share so the host (dialog/page) can close/reload. */
  readonly created = output<Share>();

  protected readonly isSaving = toSignal(this.shareService.saving$, { initialValue: false });
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
    splitMode: ['FIXED' as ShareSplitMode, Validators.required],
    quotas: this.formBuilder.array([this.createQuotaGroup()]),
  });

  private readonly sourceTypeValue = toSignal(this.form.controls.sourceType.valueChanges, {
    initialValue: this.form.controls.sourceType.getRawValue(),
  });
  private readonly sourceIdValue = toSignal(this.form.controls.sourceId.valueChanges, {
    initialValue: this.form.controls.sourceId.getRawValue(),
  });
  protected readonly splitModeValue = toSignal(this.form.controls.splitMode.valueChanges, {
    initialValue: this.form.controls.splitMode.getRawValue(),
  });
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue() as ShareFormValue,
  });
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  protected readonly sourceOptions = computed<readonly SourceOption[]>(() => {
    switch (this.sourceTypeValue()) {
      case 'EXPENSE': {
        // Backend enforces one active share per source: an expense that already has an
        // ACTIVE share is rejected if picked again. Exclude it here so the dropdown only
        // ever lists expenses that can actually be split.
        const activelySharedExpenseIds = new Set(
          this.shares()
            .filter((share) => share.sourceType === 'EXPENSE' && share.status === 'ACTIVE')
            .map((share) => share.sourceId),
        );

        return this.expenses()
          .filter((expense) => !activelySharedExpenseIds.has(expense.id))
          .map((expense) => ({
            id: expense.id,
            label: expense.name,
            amount: Number(expense.cost),
            currency: 'BRL',
            meta: `remaining ${this.fmt(Number(expense.remaining))}`,
          }));
      }
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

  protected readonly quotasTotal = computed(() =>
    this.shareFormValue().quotas.reduce(
      (sum, quota) => sum + Number(quota?.amount || 0),
      0,
    ),
  );

  /** Sum of the raw `percent` fields across quotas — only meaningful in PERCENT mode. */
  protected readonly quotasPercentTotal = computed(() =>
    this.shareFormValue().quotas.reduce(
      (sum, quota) => sum + Number(quota?.percent || 0),
      0,
    ),
  );

  /** Owner's remaining percentage at full precision — calculated, never typed by the user
   *  (design's `recalc()`: `ownerPct = 100 - sumRaw`). This is what the R$ conversion in
   *  `createShare()` must use; `ownerPercentDisplay` below is a ROUNDED-FOR-DISPLAY-ONLY
   *  copy — feeding the rounded value into the money math (as an earlier version of this
   *  component did, matching the design's own `.toFixed(1)` display formatting a bit too
   *  literally) silently drops precision from the R$ conversion, e.g. 33.334% becomes
   *  displayed "33.3%" but must still convert to R$ 333.34, not R$ 333.30. */
  protected readonly ownerPercent = computed(() => 100 - this.quotasPercentTotal());

  /** Display-only, rounded to 1 decimal (design's `sh-owner-pct` formatting). Never used
   *  for money math — see `ownerPercent` above. */
  protected readonly ownerPercentDisplay = computed(() => Number(this.ownerPercent().toFixed(1)));

  protected readonly unassignedAmount = computed(() => {
    if (this.splitModeValue() === 'PERCENT') {
      // In PERCENT mode the owner share is derived, not typed — "unassigned" is always
      // zero by construction once the percent fields are read; balancing is expressed via
      // quotasPercentTotal <= 100 instead (see canSubmit/submitBlockers).
      return 0;
    }
    return Number((this.totalAmountValue() - this.ownerShareValue() - this.quotasTotal()).toFixed(2));
  });

  protected readonly canSubmit = computed(() => {
    const wallet = this.selectedWallet();
    const source = this.selectedSource();
    const modeValid = this.splitModeValue() === 'PERCENT'
      ? this.quotasPercentTotal() <= 100.001
      : this.unassignedAmount() === 0;

    return !!wallet
      && !!source
      && this.formStatus() === 'VALID'
      && modeValid
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

    if (this.totalAmountValue() <= 0) {
      blockers.push('The source must have a total amount greater than zero.');
    }

    if (this.splitModeValue() === 'PERCENT') {
      // Design's recalc(): tolerance-based check (sumRaw > 100.001), not an exact
      // comparison — matches `Share.balanceTolerance`/`ratioTolerance` scaling server-side
      // (backend-tasks.md Task 3), which is why this never forces the sum to hit exactly 100.
      const total = this.quotasPercentTotal();
      if (total > 100.001) {
        blockers.push(`Quotas exceed 100% by ${(total - 100).toFixed(1)}%. Atual: ${total.toFixed(1)}%`);
      }
    } else {
      if (this.form.controls.ownerShare.invalid) {
        blockers.push('Owner share deve ser zero ou maior.');
      }

      const delta = this.unassignedAmount();
      if (delta !== 0) {
        blockers.push(
          `The share must balance: adjust owner share and quotas until the delta is R$ 0,00. Current delta: ${this.fmt(delta)}`,
        );
      }
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
      this.shareService.loadAll();

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

      // Auto-fill the single quota's amount with the source's total as a convenience
      // (one quota = the whole thing). Only while the user hasn't touched that field
      // themselves — this effect's own `setValue` below never marks the control dirty
      // (only real user input does, via the reactive-forms directive), so as long as
      // nothing else in this component marks the control dirty/pristine incorrectly,
      // re-running this effect after switching source keeps following the total instead
      // of leaving a stale amount from a previously-selected source (e.g. picking
      // "Microsoft" after "Netflix" used to leave Netflix's amount behind because the old
      // guard only looked at whether the field was still exactly zero). `removeQuota()`
      // explicitly restores this invariant when collapsing back to one quota — see there.
      const soleQuotaAmount = this.quotas.length === 1 ? this.quotaAt(0).controls.amount : null;
      if (source && soleQuotaAmount && !soleQuotaAmount.dirty) {
        soleQuotaAmount.setValue(amount);
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
        percent: 0,
      });
      return;
    }

    this.quotas.removeAt(index);

    // Collapsing back down to a single quota re-enables the "auto-fill amount from the
    // selected source" convenience (see the constructor effect keyed off `dirty`). That
    // convenience must resume regardless of which quota survived: if the SURVIVING quota's
    // amount was ever hand-edited by the user (e.g. quota 0 was dirtied, then quota 1 —
    // not quota 0 — got removed), `removeAt` on the FormArray leaves the surviving
    // control's `dirty` flag untouched, permanently blocking auto-fill even though there is
    // now only one quota again. Clear it here so the single-quota-remaining behavior is
    // uniform no matter which quota was removed.
    if (this.quotas.length === 1) {
      this.quotas.at(0).controls.amount.markAsPristine();
    }
  }

  protected isTransientQuota(index: number): boolean {
    return this.quotaAt(index).controls.mode.getRawValue() === 'TRANSIENT';
  }

  protected quotaModeDisabled(mode: ShareQuotaMode): boolean {
    return mode === 'TRANSIENT' && !this.transientQuotaAllowed();
  }

  protected setSplitMode(mode: ShareSplitMode): void {
    this.form.controls.splitMode.setValue(mode);
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
    const totalAmount = Number(raw.totalAmount);
    const isPercent = raw.splitMode === 'PERCENT';

    // Percent → R$ conversion (design's createShare(): `amount = total*raw/100`).
    // Deliberately NOT adjusting the last quota's cent to force the sum to close exactly
    // on `totalAmount` — the backend absorbs the rounding drift via
    // `Share.balanceTolerance(n) = 0.01 * (n+1)` and the matching `ratioTolerance`
    // (backend-tasks.md Task 3). Forcing it here would be redundant, fragile work that a
    // future reader might "fix" by re-adding — don't.
    const ownerShare = isPercent
      ? round2(totalAmount * this.ownerPercent() / 100)
      : Number(raw.ownerShare);

    const request: CreateShareRequest = {
      walletId: wallet.id,
      sourceType: raw.sourceType,
      sourceId: raw.sourceId,
      totalAmount,
      currency: source.currency,
      ownerShare,
      quotas: raw.quotas.map((quota) => {
        const amount = isPercent ? round2(totalAmount * Number(quota.percent || 0) / 100) : Number(quota.amount);

        return quota.mode === 'TRANSIENT'
          ? {
              transient_: {
                name: quota.transientName.trim(),
                ...(quota.transientPaymentDate ? { paymentDate: quota.transientPaymentDate } : {}),
              },
              amount,
            }
          : {
              payerId: quota.payerId,
              amount,
            };
      }),
    };

    this.shareService
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.resetForm();
          this.created.emit(created);
        },
        error: () => undefined,
      });
  }

  protected totalAmountValue(): number {
    return Number(this.shareFormValue().totalAmount || 0);
  }

  protected ownerShareValue(): number {
    return Number(this.shareFormValue().ownerShare || 0);
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

  /**
   * `amount` and `percent` deliberately have NO sync validators of their own (unlike the
   * pre-Task-4c form, where `amount` had `required`/`min(0.01)`): only one of the two
   * fields is relevant depending on `splitMode`, and giving both an always-on validator
   * would make `form.status` permanently INVALID in whichever mode isn't active (its
   * field sits at the default `0`, which fails `min(0.01)`, and `formStatus() === 'VALID'`
   * is one of `canSubmit()`'s gates). `quotaIssues()` — already mode-aware — is the single
   * source of truth for "is this quota's amount/percent filled in", both for blocking
   * submit and for the per-quota messages shown in `.share-validation`.
   */
  private createQuotaGroup(): QuotaFormGroup {
    return this.formBuilder.nonNullable.group({
      mode: ['EXISTING' as ShareQuotaMode, Validators.required],
      payerId: [''],
      transientName: [''],
      transientPaymentDate: [this.today()],
      amount: [0],
      percent: [0],
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
      percent: 0,
    });
  }

  private fmt(value: number, currency = 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private shareFormValue(): ShareFormValue {
    return this.formValue() as ShareFormValue;
  }

  private quotaIssues(): ShareQuotaIssue[] {
    const isPercent = this.splitModeValue() === 'PERCENT';

    return this.shareFormValue().quotas.flatMap((quota, index) => {
      const issues: ShareQuotaIssue[] = [];
      const value = isPercent ? Number(quota?.percent || 0) : Number(quota?.amount || 0);

      if (value <= 0) {
        issues.push({
          index: index + 1,
          message: isPercent ? 'the quota percentage must be greater than zero.' : 'the quota amount must be greater than zero.',
        });
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
