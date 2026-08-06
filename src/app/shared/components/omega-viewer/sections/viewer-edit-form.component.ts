import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CreditCard } from '@features/credit-card/models/credit-card';
import { PatchExpenseRequest } from '@features/expense/models/expense';
import { formatBrl } from '@shared/utils/currency';

import { OmegaViewerExpenseDetail } from '../models/omega-viewer-detail';

/**
 * Edit form for an Expense inside the Omega Viewer (F-07). Dumb/presentational like
 * `ViewerFieldListComponent` — it owns the `FormGroup` (reactive forms need somewhere to
 * live) but no HTTP, no save logic, no navigation logic. The shell:
 *   - passes the current `OmegaViewerExpenseDetail` and the credit card options in;
 *   - listens to `dirtyChange` to drive its own navigate/close guard and `disableClose`;
 *   - listens to `save` (only the fields that actually changed vs. the input detail) and
 *     calls `ExpenseService.patch()` itself.
 *
 * Installment/Subscription edit forms are out of scope here (per the design's "one form per
 * type, Expense first" plan) — this component is intentionally Expense-only, not generic.
 */
@Component({
  selector: 'app-viewer-edit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './viewer-edit-form.component.html',
  styleUrl: './viewer-edit-form.component.scss',
})
export class ViewerEditFormComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly expense = input.required<OmegaViewerExpenseDetail>();
  readonly creditCards = input<readonly CreditCard[]>([]);
  /** Disables the Save button while a patch request is in flight — shell-owned state, this
   * component has no HTTP access of its own. */
  readonly saving = input(false);
  /** Shell-owned message for the most recent failed save attempt (code review C2), `null`
   * when there is none. Rendered with `role="alert"` inside this form — not behind the modal
   * like `ExpenseService.error$`/`ExpensePage`'s own alert, which the user can't see while
   * the Viewer is open. */
  readonly saveError = input<string | null>(null);

  /** Emits only the fields whose current form value differs from `expense()` — never the
   * whole form, so the shell's PATCH payload naturally respects the backend's "absent =
   * don't touch" semantics without the shell having to diff anything itself. */
  readonly save = output<PatchExpenseRequest>();
  /** Named `cancelEdit`, not `cancel` — `cancel` collides with the native DOM `cancel` event
   * (`@angular-eslint/no-output-native`). */
  readonly cancelEdit = output<void>();
  /** Fires on every value change so the shell can track dirty state for its navigate/close
   * guard and `MatDialogRef.disableClose` toggle. */
  readonly dirtyChange = output<boolean>();

  // Same constraints as `ExpenseCreateDialogComponent`'s form — `name`/`cost`/`purchaseDate`
  // are edits of already-required Expense fields, so the same validity bar applies.
  // `creditCardId`/`details` stay optional, matching PatchExpenseRequest's own semantics.
  //
  // `cost`'s `min` starts at the DTO-level floor (`@Positive` + `@Digits(fraction=2)` on the
  // backend => 0.01) and is re-tightened per-expense in the constructor effect below to the
  // amount already paid, whichever is higher — see `minCost`.
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: ['', Validators.required],
    creditCardId: [''],
    details: [''],
  });

  /**
   * Real minimum for `cost`, derived from the expense currently being edited (code review
   * M1). `min(0.01)` alone matches the backend's DTO-level constraint (`@Positive` +
   * `@Digits(fraction=2)`) but not the business rule that actually rejects patches in
   * practice: `Expense.patch()` throws `ExpenseCostBelowPaidAmountException` when the new
   * `cost` would fall below the amount already paid (`cost - remaining`). Both `cost` and
   * `remaining` already arrive from the backend on `OmegaViewerExpenseDetail` — this reuses
   * them purely as validator input, it does not compute or display a new `remaining` value
   * (the project's hard rule against inventing financial numbers on the frontend stays
   * intact).
   */
  protected readonly minCost = computed(() => {
    const expense = this.expense();
    const paidAmount = expense.cost - expense.remaining;
    return Math.max(0.01, paidAmount);
  });

  /** Human-readable validator message for the template — only meaningful once `minCost()`
   * exceeds the DTO floor (i.e. some amount has actually been paid already); otherwise the
   * generic "maior que zero" message covers it. */
  protected readonly minCostMessage = computed(() => {
    const min = this.minCost();
    return min > 0.01
      ? `O valor não pode ser menor que ${formatBrl(min)}, já pago nesta despesa.`
      : 'Informe um valor maior que zero.';
  });

  constructor() {
    // Re-seeds the form (and clears dirty) every time the shell hands in a fresh detail —
    // covers both "edit mode just opened" and "save just succeeded and the shell pushed the
    // patched detail back down". Also re-applies `cost`'s dynamic `min` (M1) so it always
    // matches the expense currently on screen, not a stale one from a previous seed.
    effect(() => {
      const expense = this.expense();
      const minCost = this.minCost();
      this.form.controls.cost.setValidators([Validators.required, Validators.min(minCost)]);
      this.form.reset({
        name: expense.name,
        cost: expense.cost,
        purchaseDate: expense.purchaseDate,
        creditCardId: expense.creditCardId ?? '',
        details: expense.details ?? '',
      });
    });

    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.dirtyChange.emit(this.form.dirty));
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const original = this.expense();
    const value = this.form.getRawValue();
    const patch: {
      name?: string;
      cost?: number;
      purchaseDate?: string;
      creditCardId?: string;
      details?: string;
    } = {};

    if (value.name.trim() !== original.name) {
      patch.name = value.name.trim();
    }
    if (value.cost !== original.cost) {
      patch.cost = value.cost;
    }
    if (value.purchaseDate !== original.purchaseDate) {
      patch.purchaseDate = value.purchaseDate;
    }
    if (value.creditCardId !== (original.creditCardId ?? '')) {
      patch.creditCardId = value.creditCardId;
    }
    if (value.details.trim() !== (original.details ?? '')) {
      patch.details = value.details.trim();
    }

    this.save.emit(patch satisfies PatchExpenseRequest);
  }

  protected onCancel(): void {
    this.cancelEdit.emit();
  }
}
