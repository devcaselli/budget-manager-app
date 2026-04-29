import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

export interface ExpensePaymentDialogExpense {
  readonly id: string;
  readonly name: string;
  readonly remaining: string;
  readonly remainingValue: number;
}

export interface ExpensePaymentDialogBullet {
  readonly id: string;
  readonly description: string;
  readonly remaining: string;
}

export interface ExpensePaymentDialogData {
  readonly expense: ExpensePaymentDialogExpense;
  readonly bullets: readonly ExpensePaymentDialogBullet[];
}

export interface ExpensePaymentDialogResult {
  readonly bulletId: string;
  readonly amount: number;
  readonly details: string | null;
}

@Component({
  selector: 'app-expense-payment-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './expense-payment-dialog.component.html',
  styleUrl: './expense-payment-dialog.component.scss',
})
export class ExpensePaymentDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<ExpensePaymentDialogComponent, ExpensePaymentDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<ExpensePaymentDialogData>(MAT_DIALOG_DATA);
  protected readonly form = this.formBuilder.nonNullable.group({
    bulletId: ['', Validators.required],
    amount: [
      this.data.expense.remainingValue,
      [
        Validators.required,
        Validators.min(0.01),
        Validators.max(this.data.expense.remainingValue),
      ],
    ],
    details: [''],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      bulletId: value.bulletId,
      amount: value.amount,
      details: value.details.trim() || null,
    });
  }
}
