import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { formatBrl } from '@shared/utils/currency';
import { CreditCardService } from '@features/credit-card/services/credit-card.service';

import {
  SubscriptionFutureConfirmDialogComponent,
  SubscriptionFutureConfirmDialogData,
} from '../../components/subscription-future-confirm-dialog/subscription-future-confirm-dialog.component';
import {
  Subscription,
  SubscriptionFlag,
  SubscriptionState,
} from '../../models/subscription';
import { SubscriptionService } from '../../services/subscription.service';
import { resolveCurrentAmount } from '../../utils/resolve-current-amount';
import { WalletService } from '@features/wallet/services/wallet.service';

interface SubscriptionListItem {
  readonly id: string;
  readonly description: string;
  readonly currency: string;
  readonly creditCardId: string | null;
  readonly creditCardLabel: string | null;
  readonly state: SubscriptionState;
  readonly stateLabel: string;
  readonly flag: SubscriptionFlag;
  readonly isSpecial: boolean;
  readonly amountValue: number;
  readonly amount: string;
  readonly startMonthValue: string;
  readonly startMonth: string;
  readonly endMonth: string | null;
  readonly isActive: boolean;
  readonly statusLabel: string;
  readonly versionCount: number;
  readonly hasMultipleVersions: boolean;
  /** "R$70,00 → R$30,00" (first version → currently effective) — only set when multi-version. */
  readonly amountTrend: string | null;
  readonly versions: readonly { effectiveMonth: string; amount: string }[];
}

type SubscriptionFilter = 'all' | 'production' | 'preview';

@Component({
  selector: 'app-subscription-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './subscription-page.html',
  styleUrl: './subscription-page.scss',
})
export class SubscriptionPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly creditCardService = inject(CreditCardService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly walletService = inject(WalletService);

  /**
   * The wallet currently in context. Its effectiveMonth anchors both how a
   * subscription's amount is resolved for display and the month an edit takes
   * effect. Null when no wallet is selected → falls back to the current month.
   */
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  protected readonly creditCards = toSignal(this.creditCardService.cards$, { initialValue: [] });
  private readonly subscriptions = toSignal(this.subscriptionService.subscriptions$, {
    initialValue: [],
  });
  private readonly editingSubscriptionId$ = new BehaviorSubject<string | null>(null);
  protected readonly subscriptionFilter = signal<SubscriptionFilter>('all');
  protected readonly activeOnly = signal(true);

  protected readonly isLoading = toSignal(this.subscriptionService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.subscriptionService.saving$, { initialValue: false });
  protected readonly updatingSubscriptionId = toSignal(this.subscriptionService.updating$, {
    initialValue: null,
  });
  protected readonly deletingSubscriptionId = toSignal(this.subscriptionService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.subscriptionService.error$, { initialValue: null });
  protected readonly editingSubscriptionId = toSignal(this.editingSubscriptionId$, {
    initialValue: null,
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['BRL', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    creditCardId: [''],
    effectiveMonth: [this.currentMonth(), Validators.required],
    state: ['PRODUCTION' as SubscriptionState, Validators.required],
    specialSubscription: [false],
  });

  protected readonly subscriptionItems = computed<readonly SubscriptionListItem[]>(() =>
    this.subscriptions().map((sub) => this.toListItem(sub)),
  );

  protected readonly filteredSubscriptionItems = computed<readonly SubscriptionListItem[]>(() => {
    const stateFilter = this.subscriptionFilter();
    const activeOnly = this.activeOnly();

    return this.subscriptionItems().filter((sub) => {
      const stateMatches =
        stateFilter === 'all' ||
        (stateFilter === 'production' && sub.state === 'PRODUCTION') ||
        (stateFilter === 'preview' && sub.state === 'PREVIEW');
      const activeMatches = !activeOnly || sub.isActive;
      return stateMatches && activeMatches;
    });
  });

  protected readonly filteredCountLabel = computed(() => {
    const visible = this.filteredSubscriptionItems();
    const active = visible.filter((sub) => sub.isActive).length;
    return this.activeOnly() ? `${visible.length} active` : `${visible.length} total · ${active} active`;
  });

  protected readonly activeCount = computed(() =>
    this.subscriptionItems().filter((s) => s.isActive).length,
  );
  protected readonly prodTotal = computed(() => {
    const total = this.subscriptionItems()
      .filter((s) => s.isActive && s.state === 'PRODUCTION')
      .reduce((acc, s) => acc + s.amountValue, 0);
    return formatBrl(total);
  });
  protected readonly previewTotal = computed(() => {
    const total = this.subscriptionItems()
      .filter((s) => s.isActive && s.state === 'PREVIEW')
      .reduce((acc, s) => acc + s.amountValue, 0);
    return formatBrl(total);
  });

  protected readonly hasEditingSubscription = computed(() => this.editingSubscriptionId() !== null);

  constructor() {
    this.creditCardService.loadAll();
    this.subscriptionService.loadSubscriptions();
  }

  protected submitSubscription(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const editingId = this.editingSubscriptionId();
    const value = this.form.getRawValue();

    if (editingId) {
      this.subscriptionService
        .update(editingId, {
          description: value.description.trim(),
          newAmount: value.amount,
          creditCardId: value.creditCardId || undefined,
          // Anchor the amount change to the wallet in context (its effectiveMonth),
          // so past/future wallets keep their own historical amount. Omitted when
          // no wallet is selected → backend falls back to the clock month.
          effectiveMonth: this.selectedWallet()?.effectiveMonth,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => this.resetForm(), error: () => undefined });
      return;
    }

    const request = {
      description: value.description.trim(),
      amount: value.amount,
      currency: value.currency.toUpperCase(),
      ...(value.creditCardId ? { creditCardId: value.creditCardId } : {}),
      effectiveMonth: value.effectiveMonth,
      state: value.state,
      flag: value.specialSubscription ? 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION' as const : 'NONE' as const,
    };

    if (!value.specialSubscription && this.isFutureMonth(value.effectiveMonth)) {
      const data: SubscriptionFutureConfirmDialogData = {
        description: request.description || 'subscription',
        effectiveMonth: this.formatMonth(value.effectiveMonth),
        state: value.state,
      };

      this.dialog
        .open<SubscriptionFutureConfirmDialogComponent, SubscriptionFutureConfirmDialogData, boolean>(
          SubscriptionFutureConfirmDialogComponent,
          { width: '30rem', maxWidth: 'calc(100vw - 2rem)', data },
        )
        .afterClosed()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((confirmed) => {
          if (confirmed) this.createSubscription(request);
        });
      return;
    }

    this.createSubscription(request);
  }

  protected editSubscription(sub: SubscriptionListItem): void {
    this.editingSubscriptionId$.next(sub.id);
    this.form.reset({
      description: sub.description,
      amount: sub.amountValue,
      currency: sub.currency,
      creditCardId: sub.creditCardId ?? '',
      effectiveMonth: sub.startMonthValue,
      state: sub.state,
      specialSubscription: sub.isSpecial,
    });
    this.form.controls.currency.disable();
    this.form.controls.effectiveMonth.disable();
    this.form.controls.state.disable();
    this.form.controls.specialSubscription.disable();
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  protected deleteSubscription(id: string): void {
    this.subscriptionService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.editingSubscriptionId() === id) this.resetForm();
        },
        error: () => undefined,
      });
  }

  protected toggleSpecial(): void {
    const current = this.form.controls.specialSubscription.value;
    this.form.controls.specialSubscription.setValue(!current);
  }

  protected setSubscriptionFilter(filter: SubscriptionFilter): void {
    this.subscriptionFilter.set(filter);
  }

  protected toggleActiveOnly(): void {
    this.activeOnly.update((value) => !value);
  }

  private toListItem(sub: Subscription): SubscriptionListItem {
    const creditCardNameById = new Map(this.creditCards().map((card) => [card.id, card.name]));
    const formatAmount = this.amountFormatter(sub.currency);

    // Sorted ascending → chronological timeline (oldest first) for display.
    const versions = [...sub.versions].sort((a, b) =>
      a.effectiveMonth.localeCompare(b.effectiveMonth),
    );
    // Resolve the amount IN EFFECT for the wallet in context (its effectiveMonth),
    // falling back to the current month when no wallet is selected. Never blindly
    // the newest version.
    const amountValue = resolveCurrentAmount(sub.versions, this.targetMonth());
    const hasMultipleVersions = versions.length > 1;
    const firstAmount = Number(versions[0]?.amount ?? amountValue);
    const isActive = sub.endMonth === null;

    return {
      id: sub.id,
      description: sub.description,
      currency: sub.currency,
      creditCardId: sub.creditCardId,
      creditCardLabel:
        sub.creditCard?.name
        ?? (sub.creditCardId ? (creditCardNameById.get(sub.creditCardId) ?? sub.creditCardId) : null),
      state: sub.state,
      stateLabel: sub.state === 'PREVIEW' ? 'Preview' : 'Production',
      flag: sub.flag,
      isSpecial: sub.flag === 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION',
      amountValue,
      amount: formatAmount(amountValue),
      startMonthValue: sub.startMonth,
      startMonth: this.formatMonth(sub.startMonth),
      endMonth: sub.endMonth ? this.formatMonth(sub.endMonth) : null,
      isActive,
      statusLabel: isActive ? 'ACTIVE' : 'CLOSED',
      versionCount: versions.length,
      hasMultipleVersions,
      amountTrend:
        hasMultipleVersions && firstAmount !== amountValue
          ? `${formatAmount(firstAmount)} → ${formatAmount(amountValue)}`
          : null,
      versions: versions.map((v) => ({
        effectiveMonth: this.formatMonth(v.effectiveMonth),
        amount: formatAmount(Number(v.amount)),
      })),
    };
  }

  private amountFormatter(currency: string): (value: number) => string {
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    return (value) => formatter.format(value);
  }

  private formatMonth(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );
  }

  private resetForm(): void {
    this.editingSubscriptionId$.next(null);
    this.form.controls.currency.enable();
    this.form.controls.creditCardId.enable();
    this.form.controls.effectiveMonth.enable();
    this.form.controls.state.enable();
    this.form.controls.specialSubscription.enable();
    this.form.reset({
      description: '',
      amount: 0,
      currency: 'BRL',
      creditCardId: '',
      effectiveMonth: this.currentMonth(),
      state: 'PRODUCTION',
      specialSubscription: false,
    });
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  /**
   * The month that anchors amount resolution and edits: the selected wallet's
   * effectiveMonth, or the current month when no wallet is in context.
   */
  private targetMonth(): string {
    return this.selectedWallet()?.effectiveMonth ?? this.currentMonth();
  }

  private isFutureMonth(value: string): boolean {
    return value > this.currentMonth();
  }

  private createSubscription(input: {
    readonly description: string;
    readonly amount: number;
    readonly currency: string;
    readonly creditCardId?: string;
    readonly effectiveMonth: string;
    readonly state: SubscriptionState;
    readonly flag: SubscriptionFlag;
  }): void {
    this.subscriptionService
      .create(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.resetForm(), error: () => undefined });
  }
}
