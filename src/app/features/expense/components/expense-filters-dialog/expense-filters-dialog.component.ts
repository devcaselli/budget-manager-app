import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ExpensePaymentStatus, ExpenseSortOrder } from '@features/expense/expense-list.filters';

/** Matches `ExpensePage.filtersForm`'s control shape exactly (search/paymentStatus are
 *  bound here too, even though this modal's template doesn't render them — the toolbar
 *  owns those two per the D9 handoff, but the dialog still needs the same `FormGroup`
 *  reference so its own bound controls read/write the one shared form instance). */
export interface ExpenseFiltersFormControls {
  search: FormControl<string>;
  creditCardId: FormControl<string>;
  sortOrder: FormControl<ExpenseSortOrder>;
  paymentStatus: FormControl<ExpensePaymentStatus>;
  startDate: FormControl<string>;
  endDate: FormControl<string>;
  unhidden: FormControl<boolean>;
}

export interface ExpenseFiltersDialogCreditCard {
  readonly id: string;
  readonly name: string;
}

export interface ExpenseFiltersDialogData {
  /** The page's own live `filtersForm` — bound directly, not copied, so every edit here
   *  applies instantly to `filteredExpenseItems()` exactly like the old inline panel did.
   *  Closing the dialog (Cancel, Escape, backdrop click) never needs to "revert" anything
   *  because there is no draft state to discard. */
  readonly form: FormGroup<ExpenseFiltersFormControls>;
  readonly creditCards: readonly ExpenseFiltersDialogCreditCard[];
  /** Grouped-by-day layout always orders by date — VALUE_ASC/VALUE_DESC only applies
   *  within a day there, same rule the old inline panel enforced (disabled options +
   *  explanatory hint), read live so toggling layout while the modal is open updates it. */
  readonly isGroupedLayout: () => boolean;
}

@Component({
  selector: 'app-expense-filters-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './expense-filters-dialog.component.html',
  styleUrl: './expense-filters-dialog.component.scss',
})
export class ExpenseFiltersDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<ExpenseFiltersDialogComponent>>(MatDialogRef);

  protected readonly data = inject<ExpenseFiltersDialogData>(MAT_DIALOG_DATA);
  protected readonly form = this.data.form;
  protected readonly creditCards = this.data.creditCards;
  protected readonly isGroupedLayout = this.data.isGroupedLayout;

  private readonly sortOrderValue = toSignal(this.form.controls.sortOrder.valueChanges, {
    initialValue: this.form.controls.sortOrder.value,
  });

  protected readonly showValueSortHint = computed(
    () =>
      this.isGroupedLayout() &&
      (this.sortOrderValue() === 'VALUE_ASC' || this.sortOrderValue() === 'VALUE_DESC'),
  );

  // P2-3 (post-review-visual): design uses a `role="switch"` button (track+knob),
  // not a native checkbox — kept bound to the same shared `unhidden` control so
  // every other consumer of `data.form` still sees live updates.
  protected readonly unhiddenValue = toSignal(this.form.controls.unhidden.valueChanges, {
    initialValue: this.form.controls.unhidden.value,
  });

  protected toggleUnhidden(): void {
    this.form.controls.unhidden.setValue(!this.form.controls.unhidden.value);
  }

  protected close(): void {
    this.dialogRef.close();
  }
}
