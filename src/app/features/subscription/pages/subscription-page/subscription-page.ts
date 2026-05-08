import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import {
  Subscription,
  SubscriptionFlag,
  SubscriptionState,
  SubscriptionVersion,
} from '../../models/subscription';
import { SubscriptionService } from '../../services/subscription.service';

interface SubscriptionListItem {
  readonly id: string;
  readonly description: string;
  readonly currency: string;
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
  private readonly formBuilder = inject(FormBuilder);
  private readonly subscriptionService = inject(SubscriptionService);

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
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
  });
  protected readonly previewTotal = computed(() => {
    const total = this.subscriptionItems()
      .filter((s) => s.isActive && s.state === 'PREVIEW')
      .reduce((acc, s) => acc + s.amountValue, 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
  });

  protected readonly hasEditingSubscription = computed(() => this.editingSubscriptionId() !== null);

  constructor() {
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
        .update(editingId, { description: value.description.trim(), newAmount: value.amount })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => this.resetForm(), error: () => undefined });
      return;
    }

    this.subscriptionService
      .create({
        description: value.description.trim(),
        amount: value.amount,
        currency: value.currency.toUpperCase(),
        effectiveMonth: value.effectiveMonth,
        state: value.state,
        flag: value.specialSubscription ? 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION' : 'NONE',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.resetForm(), error: () => undefined });
  }

  protected editSubscription(sub: SubscriptionListItem): void {
    this.editingSubscriptionId$.next(sub.id);
    this.form.reset({
      description: sub.description,
      amount: sub.amountValue,
      currency: sub.currency,
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
    const versions = [...sub.versions].sort((a, b) =>
      b.effectiveMonth.localeCompare(a.effectiveMonth),
    );
    const currentVersion = versions[0];
    const amountValue = Number(currentVersion?.amount ?? 0);
    const isActive = sub.endMonth === null;

    return {
      id: sub.id,
      description: sub.description,
      currency: sub.currency,
      state: sub.state,
      stateLabel: sub.state === 'PREVIEW' ? 'Preview' : 'Production',
      flag: sub.flag,
      isSpecial: sub.flag === 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION',
      amountValue,
      amount: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: sub.currency }).format(amountValue),
      startMonthValue: sub.startMonth,
      startMonth: this.formatMonth(sub.startMonth),
      endMonth: sub.endMonth ? this.formatMonth(sub.endMonth) : null,
      isActive,
      statusLabel: isActive ? 'ACTIVE' : 'CLOSED',
      versionCount: versions.length,
      versions: versions.map((v) => ({
        effectiveMonth: this.formatMonth(v.effectiveMonth),
        amount: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: sub.currency }).format(Number(v.amount)),
      })),
    };
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
    this.form.controls.effectiveMonth.enable();
    this.form.controls.state.enable();
    this.form.controls.specialSubscription.enable();
    this.form.reset({
      description: '',
      amount: 0,
      currency: 'BRL',
      effectiveMonth: this.currentMonth(),
      state: 'PRODUCTION',
      specialSubscription: false,
    });
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
