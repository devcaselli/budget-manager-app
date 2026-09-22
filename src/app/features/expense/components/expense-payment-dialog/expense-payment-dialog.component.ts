import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

const LAST_BULLET_KEY = 'ew_last_bullet_id';

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
    MatDialogModule,
    MatIconModule,
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

  private resolveInitialBulletId(): string {
    const lastId = localStorage.getItem(LAST_BULLET_KEY) ?? '';
    const existsInList = this.data.bullets.some((b) => b.id === lastId);
    return existsInList ? lastId : '';
  }

  protected readonly form = this.formBuilder.nonNullable.group({
    bulletId: [this.resolveInitialBulletId(), Validators.required],
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

  /**
   * P2-4 (post-epic-audit): value-shortcut chips (design ~L636-640) — "Full amount" sets
   * the whole remaining balance, "Half" rounds to cents, "Round down" floors to the
   * nearest whole currency unit (never rounds UP past the remaining balance, which
   * `Validators.max` would reject).
   */
  protected applyFullAmount(): void {
    this.form.controls.amount.setValue(this.data.expense.remainingValue);
  }

  protected applyHalfAmount(): void {
    const half = Math.round((this.data.expense.remainingValue / 2) * 100) / 100;
    this.form.controls.amount.setValue(half);
  }

  protected applyRoundDownAmount(): void {
    const roundedDown = Math.floor(this.data.expense.remainingValue);
    this.form.controls.amount.setValue(roundedDown);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    localStorage.setItem(LAST_BULLET_KEY, value.bulletId);
    this.dialogRef.close({
      bulletId: value.bulletId,
      amount: value.amount,
      details: value.details.trim() || null,
    });
  }
}
