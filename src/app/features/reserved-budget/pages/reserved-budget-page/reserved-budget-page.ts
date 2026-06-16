import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
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
import { ReservedBudget, UpdateReservedBudgetRequest } from '../../models/reserved-budget';
import { ReservedBudgetService } from '../../services/reserved-budget.service';
import { formatBrl } from '@shared/utils/currency';

interface ReservedBudgetVersionView {
  readonly effectiveMonth: string;
  readonly amount: string;
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

  private readonly reservedBudgets = toSignal(this.reservedBudgetService.reservedBudgets$, {
    initialValue: [],
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
    this.reservedBudgetService.loadReservedBudgets();
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
