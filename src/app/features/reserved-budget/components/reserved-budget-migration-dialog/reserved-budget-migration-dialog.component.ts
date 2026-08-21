import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ReservedBudgetMigrationDialogBullet {
  readonly id: string;
  /** Already formatted, for display in the <option>. */
  readonly remaining: string;
  readonly description: string;
}

export interface ReservedBudgetMigrationDialogData {
  readonly reservedBudgetDescription: string;
  /** Cap: the reserved budget's available balance for the viewed month (`remainingAmount`). */
  readonly availableValue: number;
  readonly availableLabel: string;
  readonly currency: string;
  /** Viewed month (`YYYY-MM`), display-only — the page decides what goes into the request. */
  readonly effectiveMonthLabel: string;
  readonly bullets: readonly ReservedBudgetMigrationDialogBullet[];
}

export interface ReservedBudgetMigrationDialogResult {
  readonly bulletId: string;
  readonly amount: number;
}

@Component({
  selector: 'app-reserved-budget-migration-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './reserved-budget-migration-dialog.component.html',
  styleUrl: './reserved-budget-migration-dialog.component.scss',
})
export class ReservedBudgetMigrationDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<ReservedBudgetMigrationDialogComponent, ReservedBudgetMigrationDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<ReservedBudgetMigrationDialogData>(MAT_DIALOG_DATA);

  // amount pattern mirrors the reserved-budget form (reserved-budget-page.ts): positive,
  // <= 12 integer digits + 2 fraction digits, matching the backend's BigDecimal constraint.
  protected readonly form = this.formBuilder.nonNullable.group({
    bulletId: ['', Validators.required],
    amount: [
      0,
      [
        Validators.required,
        Validators.min(0.01),
        Validators.max(this.data.availableValue),
        Validators.pattern(/^\d{1,12}(\.\d{1,2})?$/),
      ],
    ],
  });

  // initialValue is required — without it the signal reads undefined until the first keystroke
  // and exceedsAvailable() would lie about the initial state.
  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.getRawValue(),
  });

  protected readonly exceedsAvailable = computed(
    () => this.amountValue() > this.data.availableValue,
  );

  private readonly remainingAfterValue = computed(
    () => this.data.availableValue - (this.amountValue() || 0),
  );

  // Formatted here (not with the shared brlCurrency pipe) because this dialog is
  // currency-agnostic — data.currency can be USD/EUR, and that pipe hardcodes BRL.
  protected readonly remainingAfterLabel = computed(() =>
    this.formatCurrency(this.remainingAfterValue(), this.data.currency),
  );

  protected confirm(): void {
    // Re-check exceedsAvailable() even though the Validators.max above already guards it — the
    // live feedback is not the only barrier (RBM-F5 acceptance criterion).
    if (this.form.invalid || this.exceedsAvailable()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({ bulletId: value.bulletId, amount: value.amount });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }
}
