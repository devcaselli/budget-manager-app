import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';

import {
  ReservedBudgetDeleteDialogComponent,
  ReservedBudgetDeleteDialogData,
} from '../../components/reserved-budget-delete-dialog/reserved-budget-delete-dialog.component';
import {
  ReservedBudgetLinkDialogComponent,
  ReservedBudgetLinkDialogData,
  ReservedBudgetLinkDialogResult,
  ReservedBudgetLinkSourceOption,
} from '../../components/reserved-budget-link-dialog/reserved-budget-link-dialog.component';
import {
  ReservedBudget,
  ReservedBudgetLink,
  ReservedBudgetLinkSourceType,
  ReservedBudgetMigration,
  UpdateReservedBudgetRequest,
} from '../../models/reserved-budget';
import { ReservedBudgetService } from '../../services/reserved-budget.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { formatBrl } from '@shared/utils/currency';

interface ReservedBudgetVersionView {
  readonly effectiveMonth: string;
  readonly amount: string;
}

interface ReservedBudgetLinkView {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  readonly fromMonth: string;
  readonly label: string;
}

/**
 * View model for one migration chip. Consumed by both the card (RBM-F4) and — per the 3rd-round
 * note in the plan doc — `blockingMigrations` of the delete-modality dialog (RBM-F13) and its
 * chained undo-and-end/skip shortcut (RBM-F12a), which need `extraBudgetId` (for the DELETE),
 * `bulletLabel`/`amount` (for the confirmation text) and `amountValue` (for the summary total).
 * None of these 5 fields may be dropped as "unused by the card" without checking those callers.
 */
interface ReservedBudgetMigrationView {
  readonly extraBudgetId: string;
  readonly bulletId: string;
  readonly bulletLabel: string;
  readonly amount: string;
  readonly amountValue: number;
}

interface ReservedBudgetListItem {
  readonly id: string;
  readonly description: string;
  readonly details: string | null;
  readonly currency: string;
  readonly amountValue: number;
  readonly amount: string;
  readonly startMonthValue: string;
  readonly startMonth: string;
  readonly versionCount: number;
  readonly versions: readonly ReservedBudgetVersionView[];
  readonly links: readonly ReservedBudgetLinkView[];
  readonly migrations: readonly ReservedBudgetMigrationView[];
  /** True when the backend supplied consumed/remaining for this row (false on the plain list). */
  readonly hasConsumption: boolean;
  readonly consumed: string | null;
  readonly remaining: string | null;
  /** Raw `remainingAmount` for the viewed month; `null` when `hasConsumption` is false. Used as
   * the migration cap (RBM-F3/F5/F6) instead of reparsing the formatted `remaining` string. */
  readonly remainingValue: number | null;
  /** 0–100; consumed share of the ceiling. 0 when consumption data is absent. */
  readonly consumedProgress: number;
  /** True when this reserve can be migrated from: consumption data is present (implies the
   * viewed month, not just "now"), remaining balance is positive, and a wallet is selected. */
  readonly canMigrate: boolean;
}

@Component({
  selector: 'app-reserved-budget-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './reserved-budget-page.html',
  styleUrl: './reserved-budget-page.scss',
})
export class ReservedBudgetPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly reservedBudgetService = inject(ReservedBudgetService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly installmentService = inject(InstallmentService);
  private readonly bulletService = inject(BulletService);
  private readonly walletService = inject(WalletService);

  private readonly reservedBudgets = toSignal(this.reservedBudgetService.reservedBudgets$, {
    initialValue: [],
  });
  private readonly subscriptions = toSignal(this.subscriptionService.subscriptions$, {
    initialValue: [],
  });
  private readonly installments = toSignal(this.installmentService.allInstallments$, {
    initialValue: [],
  });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly editingReservedBudgetId$ = new BehaviorSubject<string | null>(null);

  // Earliest month the edited amount may take effect (the budget's startMonth); null when creating.
  private editMinEffectiveMonthValue: string | null = null;
  // Amount loaded into the form when editing started; lets us skip effectiveMonth if it is untouched.
  private editOriginalAmount: number | null = null;

  protected readonly isLoading = toSignal(this.reservedBudgetService.loading$, {
    initialValue: false,
  });
  protected readonly isSaving = toSignal(this.reservedBudgetService.saving$, { initialValue: false });
  protected readonly updatingReservedBudgetId = toSignal(this.reservedBudgetService.updating$, {
    initialValue: null,
  });
  protected readonly linkingReservedBudgetId = toSignal(this.reservedBudgetService.linking$, {
    initialValue: null,
  });
  protected readonly migratingReservedBudgetId = toSignal(this.reservedBudgetService.migrating$, {
    initialValue: null,
  });
  protected readonly deletingReservedBudgetId = toSignal(this.reservedBudgetService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.reservedBudgetService.error$, {
    initialValue: null,
  });
  protected readonly editingReservedBudgetId = toSignal(this.editingReservedBudgetId$, {
    initialValue: null,
  });

  // budget: positive, <= 2 decimal digits, mirrors backend (positive, max 12 int + 2 fraction).
  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    details: ['', Validators.maxLength(255)],
    budget: [0, [Validators.required, Validators.min(0.01), Validators.pattern(/^\d{1,12}(\.\d{1,2})?$/)]],
    currency: ['BRL', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    effectiveMonth: [
      this.currentMonth(),
      [Validators.required, (control: AbstractControl<string>) => this.validateMinEffectiveMonth(control)],
    ],
  });

  private readonly subscriptionOptions = computed<readonly ReservedBudgetLinkSourceOption[]>(() =>
    this.subscriptions().map((sub) => ({ id: sub.id, label: sub.description })),
  );

  private readonly installmentOptions = computed<readonly ReservedBudgetLinkSourceOption[]>(() =>
    this.installments().map((inst) => ({
      id: inst.id,
      label: `${inst.description} · ${inst.installmentNumber}x`,
    })),
  );

  private readonly sourceLabels = computed<ReadonlyMap<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const option of this.subscriptionOptions()) labels.set(option.id, option.label);
    for (const option of this.installmentOptions()) labels.set(option.id, option.label);
    return labels;
  });

  protected readonly reservedBudgetItems = computed<readonly ReservedBudgetListItem[]>(() =>
    this.reservedBudgets().map((budget) => this.toListItem(budget)),
  );

  protected readonly activeCount = computed(() => this.reservedBudgetItems().length);

  protected readonly reservedTotal = computed(() => {
    const total = this.reservedBudgetItems().reduce((acc, item) => acc + item.amountValue, 0);
    return formatBrl(total);
  });

  protected readonly hasEditingReservedBudget = computed(
    () => this.editingReservedBudgetId() !== null,
  );

  protected readonly editingReservedBudget = computed<ReservedBudgetListItem | null>(() => {
    const editingId = this.editingReservedBudgetId();
    if (!editingId) return null;
    return this.reservedBudgetItems().find((item) => item.id === editingId) ?? null;
  });

  // Earliest month the new amount may take effect (the edited budget's startMonth); null when creating.
  protected readonly editMinEffectiveMonth = computed<string | null>(
    () => this.editingReservedBudget()?.startMonthValue ?? null,
  );

  protected readonly editMinEffectiveMonthLabel = computed<string | null>(
    () => this.editingReservedBudget()?.startMonth ?? null,
  );

  constructor() {
    this.subscriptionService.loadSubscriptions();

    // The reserved-budget month follows the selected wallet's effectiveMonth (the month the
    // user is viewing), not the real-world current month. Reload whenever it changes.
    effect(() => {
      const wallet = this.selectedWallet();
      this.installmentService.loadByWalletId(wallet?.id ?? null);
      // Bullets aren't needed to resolve migration labels (bulletDescription already arrives
      // resolved from the backend, RBM-F1) — they're loaded here for the migration dialog's
      // bullet picker and each option's `remaining` figure (RBM-F5).
      this.bulletService.loadByWalletId(wallet?.id ?? null);
      this.reservedBudgetService.loadReservedBudgets(wallet?.effectiveMonth);
    });
  }

  protected submitReservedBudget(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const editingId = this.editingReservedBudgetId();
    const value = this.form.getRawValue();

    if (editingId) {
      this.reservedBudgetService
        .update(editingId, this.buildUpdateRequest(value))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => this.resetForm(), error: () => undefined });
      return;
    }

    this.reservedBudgetService
      .create({
        description: value.description.trim(),
        details: value.details.trim() || null,
        budget: value.budget,
        currency: value.currency.toUpperCase(),
        effectiveMonth: value.effectiveMonth,
        flag: 'NONE',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.resetForm(), error: () => undefined });
  }

  protected editReservedBudget(item: ReservedBudgetListItem): void {
    this.editingReservedBudgetId$.next(item.id);
    // The new amount cannot take effect before the budget's startMonth (backend rule).
    this.editMinEffectiveMonthValue = item.startMonthValue;
    this.editOriginalAmount = item.amountValue;
    this.form.reset({
      description: item.description,
      details: item.details ?? '',
      budget: item.amountValue,
      currency: item.currency,
      effectiveMonth: this.defaultEditEffectiveMonth(item.startMonthValue),
    });
    // Currency stays locked; the effective month is editable so a new amount can apply from a later month.
    this.form.controls.currency.disable();
    this.form.controls.effectiveMonth.enable();
    this.form.controls.effectiveMonth.updateValueAndValidity();
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  protected deleteReservedBudget(item: ReservedBudgetListItem): void {
    const data: ReservedBudgetDeleteDialogData = { description: item.description };

    this.dialog
      .open<ReservedBudgetDeleteDialogComponent, ReservedBudgetDeleteDialogData, boolean>(
        ReservedBudgetDeleteDialogComponent,
        { width: '30rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.confirmDelete(item.id);
      });
  }

  protected openLinkDialog(item: ReservedBudgetListItem): void {
    // Hide sources already linked to this RB so they can't be linked twice.
    const linkedIds = new Set(item.links.map((link) => link.sourceId));
    const notLinked = (option: ReservedBudgetLinkSourceOption): boolean => !linkedIds.has(option.id);

    const data: ReservedBudgetLinkDialogData = {
      reservedBudgetDescription: item.description,
      subscriptions: this.subscriptionOptions().filter(notLinked),
      installments: this.installmentOptions().filter(notLinked),
      hasWallet: this.selectedWallet() !== null,
    };

    this.dialog
      .open<
        ReservedBudgetLinkDialogComponent,
        ReservedBudgetLinkDialogData,
        ReservedBudgetLinkDialogResult
      >(ReservedBudgetLinkDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.linkSource(item.id, result);
      });
  }

  // No confirmation dialog yet — RBM-F7 inserts one before this call goes live. Left calling the
  // service directly (undecorated) is the explicit fallback the task text allows when F4 and F7
  // are implemented in separate passes.
  protected undoMigration(item: ReservedBudgetListItem, migration: ReservedBudgetMigrationView): void {
    this.reservedBudgetService
      .deleteMigration(item.id, migration.extraBudgetId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadForViewedMonth(), error: () => undefined });
  }

  protected unlinkSource(item: ReservedBudgetListItem, link: ReservedBudgetLinkView): void {
    this.reservedBudgetService
      .unlink(item.id, link.sourceType, link.sourceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadForViewedMonth(), error: () => undefined });
  }

  private linkSource(id: string, result: ReservedBudgetLinkDialogResult): void {
    this.reservedBudgetService
      .link(id, {
        sourceType: result.sourceType,
        sourceId: result.sourceId,
        fromMonth: result.fromMonth,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadForViewedMonth(), error: () => undefined });
  }

  // link/unlink responses carry current-month figures; reload so the list reflects the
  // wallet's viewed month instead.
  private reloadForViewedMonth(): void {
    this.reservedBudgetService.loadReservedBudgets(this.selectedWallet()?.effectiveMonth);
  }

  private confirmDelete(id: string): void {
    this.reservedBudgetService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.editingReservedBudgetId() === id) this.resetForm();
        },
        error: () => undefined,
      });
  }

  private toListItem(budget: ReservedBudget): ReservedBudgetListItem {
    const versions = [...budget.versions].sort((a, b) =>
      b.effectiveMonth.localeCompare(a.effectiveMonth),
    );
    const currentVersion = versions[0];
    const amountValue = Number(currentVersion?.amount ?? 0);
    const consumption = this.toConsumptionView(budget);
    // hasConsumption implies the list is scoped to the viewed month (activeAt listing) — no
    // separate "not the current month" check is needed on top of it (decision #2).
    const canMigrate =
      consumption.hasConsumption &&
      (consumption.remainingValue ?? 0) > 0 &&
      this.selectedWallet() !== null;

    return {
      id: budget.id,
      description: budget.description,
      details: budget.details,
      currency: budget.currency,
      amountValue,
      amount: this.formatCurrency(amountValue, budget.currency),
      startMonthValue: budget.startMonth,
      startMonth: this.formatMonth(budget.startMonth),
      versionCount: versions.length,
      versions: versions.map((version) => ({
        effectiveMonth: this.formatMonth(version.effectiveMonth),
        amount: this.formatCurrency(Number(version.amount), budget.currency),
      })),
      links: budget.links.map((link) => this.toLinkView(link)),
      migrations: (budget.migrations ?? []).map((migration) =>
        this.toMigrationView(migration, budget.currency),
      ),
      ...consumption,
      canMigrate,
    };
  }

  // The backend only fills consumed/remaining on the active-at listing, link and detail
  // responses; guard against null so the plain list never renders NaN.
  private toConsumptionView(budget: ReservedBudget): {
    hasConsumption: boolean;
    consumed: string | null;
    remaining: string | null;
    remainingValue: number | null;
    consumedProgress: number;
  } {
    const consumed = budget.consumedAmount;
    const remaining = budget.remainingAmount;
    if (consumed == null || remaining == null) {
      return {
        hasConsumption: false,
        consumed: null,
        remaining: null,
        remainingValue: null,
        consumedProgress: 0,
      };
    }

    const consumedValue = Number(consumed);
    const remainingValue = Number(remaining);
    const ceiling = consumedValue + remainingValue;
    const progress = ceiling > 0 ? Math.min((consumedValue / ceiling) * 100, 100) : 0;

    return {
      hasConsumption: true,
      consumed: this.formatCurrency(consumedValue, budget.currency),
      remaining: this.formatCurrency(remainingValue, budget.currency),
      remainingValue,
      consumedProgress: progress,
    };
  }

  private toLinkView(link: ReservedBudgetLink): ReservedBudgetLinkView {
    return {
      sourceType: link.sourceType,
      sourceId: link.sourceId,
      fromMonth: this.formatMonth(link.fromMonth),
      label: this.sourceLabels().get(link.sourceId) ?? link.sourceId,
    };
  }

  // bulletDescription arrives already resolved from the backend (RBM-F1) — no Map/lookup by id
  // needed here, unlike sourceLabels() above. Falling back to the raw bulletId mirrors the same
  // fallback grammar as toLinkView() so the UI never shows `undefined`.
  private toMigrationView(
    migration: ReservedBudgetMigration,
    currency: string,
  ): ReservedBudgetMigrationView {
    return {
      extraBudgetId: migration.extraBudgetId,
      bulletId: migration.bulletId,
      bulletLabel: migration.bulletDescription || migration.bulletId,
      amount: this.formatCurrency(migration.amount, currency),
      amountValue: migration.amount,
    };
  }

  private formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }

  private formatMonth(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  private resetForm(): void {
    this.editingReservedBudgetId$.next(null);
    this.editMinEffectiveMonthValue = null;
    this.editOriginalAmount = null;
    this.form.controls.currency.enable();
    this.form.controls.effectiveMonth.enable();
    this.form.reset({
      description: '',
      details: '',
      budget: 0,
      currency: 'BRL',
      effectiveMonth: this.currentMonth(),
    });
  }

  private buildUpdateRequest(value: {
    description: string;
    details: string;
    budget: number;
    effectiveMonth: string;
  }): UpdateReservedBudgetRequest {
    const request: UpdateReservedBudgetRequest = {
      description: value.description.trim(),
      details: value.details.trim() || null,
      newAmount: value.budget,
    };

    // effectiveMonth is meaningless without an amount change; only send it when the amount changed.
    if (this.editOriginalAmount !== null && value.budget !== this.editOriginalAmount) {
      return { ...request, effectiveMonth: value.effectiveMonth };
    }

    return request;
  }

  // Pre-fills the picker with the later of "now" and startMonth so the default is always valid.
  private defaultEditEffectiveMonth(startMonth: string): string {
    const now = this.currentMonth();
    return now >= startMonth ? now : startMonth;
  }

  private validateMinEffectiveMonth(control: AbstractControl<string>): ValidationErrors | null {
    const minMonth = this.editMinEffectiveMonthValue;
    if (!minMonth || !control.value) return null;
    return control.value < minMonth ? { minMonth: { min: minMonth, actual: control.value } } : null;
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
