import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject } from 'rxjs';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

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
  readonly versions: readonly SubscriptionVersionListItem[];
}

interface SubscriptionVersionListItem {
  readonly effectiveMonth: string;
  readonly amount: string;
}

@Component({
  selector: 'app-subscription-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    PageHeaderComponent,
    ReactiveFormsModule,
  ],
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
    this.subscriptions().map((subscription) => this.toListItem(subscription)),
  );

  protected readonly activeSubscriptions = computed(
    () => this.subscriptionItems().filter((subscription) => subscription.isActive).length,
  );
  protected readonly previewSubscriptions = computed(
    () =>
      this.subscriptionItems().filter(
        (subscription) => subscription.isActive && subscription.state === 'PREVIEW',
      ).length,
  );
  protected readonly monthlyTotal = computed(() =>
    this.subscriptionItems()
      .filter((subscription) => subscription.isActive && subscription.state === 'PRODUCTION')
      .reduce((total, subscription) => total + subscription.amountValue, 0),
  );
  protected readonly formattedMonthlyTotal = computed(() => this.formatCurrency(this.monthlyTotal()));
  protected readonly hasEditingSubscription = computed(() => this.editingSubscriptionId() !== null);

  constructor() {
    this.subscriptionService.loadSubscriptions();
  }

  protected refreshSubscriptions(): void {
    this.subscriptionService.loadSubscriptions();
  }

  protected submitSubscription(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const editingSubscriptionId = this.editingSubscriptionId();
    const value = this.form.getRawValue();

    if (editingSubscriptionId) {
      this.subscriptionService
        .update(editingSubscriptionId, {
          description: value.description.trim(),
          newAmount: value.amount,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.resetForm(),
          error: () => undefined,
        });
      return;
    }

    this.subscriptionService
      .create({
        description: value.description.trim(),
        amount: value.amount,
        currency: value.currency.toUpperCase(),
        effectiveMonth: value.effectiveMonth,
        state: value.state,
        flag: this.toFlag(value.specialSubscription),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.resetForm(),
        error: () => undefined,
      });
  }

  protected editSubscription(subscription: SubscriptionListItem): void {
    this.editingSubscriptionId$.next(subscription.id);
    this.form.reset({
      description: subscription.description,
      amount: subscription.amountValue,
      currency: subscription.currency,
      effectiveMonth: subscription.startMonthValue,
      state: subscription.state,
      specialSubscription: subscription.isSpecial,
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
          if (this.editingSubscriptionId() === id) {
            this.resetForm();
          }
        },
        error: () => undefined,
      });
  }

  private toListItem(subscription: Subscription): SubscriptionListItem {
    const versions = [...subscription.versions].sort((first, second) =>
      second.effectiveMonth.localeCompare(first.effectiveMonth),
    );
    const currentVersion = versions[0];
    const amountValue = Number(currentVersion?.amount ?? 0);
    const isActive = subscription.endMonth === null;

    return {
      id: subscription.id,
      description: subscription.description,
      currency: subscription.currency,
      state: subscription.state,
      stateLabel: this.formatState(subscription.state),
      flag: subscription.flag,
      isSpecial: subscription.flag === 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION',
      amountValue,
      amount: this.formatCurrency(amountValue, subscription.currency),
      startMonthValue: subscription.startMonth,
      startMonth: this.formatMonth(subscription.startMonth),
      endMonth: subscription.endMonth ? this.formatMonth(subscription.endMonth) : null,
      isActive,
      statusLabel: isActive ? 'Ativa' : 'Encerrada',
      versionCount: versions.length,
      versions: versions.map((version) => this.toVersionListItem(version, subscription.currency)),
    };
  }

  private toVersionListItem(
    version: SubscriptionVersion,
    currency: string,
  ): SubscriptionVersionListItem {
    return {
      effectiveMonth: this.formatMonth(version.effectiveMonth),
      amount: this.formatCurrency(Number(version.amount), currency),
    };
  }

  private formatCurrency(value: number, currency = 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(value);
  }

  private formatMonth(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
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

  private formatState(state: SubscriptionState): string {
    return state === 'PREVIEW' ? 'Preview' : 'Production';
  }

  private toFlag(isSpecial: boolean): SubscriptionFlag {
    return isSpecial ? 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION' : 'NONE';
  }
}
