import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CreditCard } from '@features/credit-card/models/credit-card';
import { PatchExpenseRequest } from '@features/expense/models/expense';

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
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: ['', Validators.required],
    creditCardId: [''],
    details: [''],
  });

  constructor() {
    // Re-seeds the form (and clears dirty) every time the shell hands in a fresh detail —
    // covers both "edit mode just opened" and "save just succeeded and the shell pushed the
    // patched detail back down".
    effect(() => {
      const expense = this.expense();
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
