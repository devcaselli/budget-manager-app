import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

export interface ExtraBudgetAllocationDialogBullet {
  readonly id: string;
  readonly description: string;
  readonly budget: number;
  readonly remaining: number;
}

export interface ExtraBudgetAllocationDialogData {
  readonly walletDescription: string;
  readonly bullet: ExtraBudgetAllocationDialogBullet;
}

export interface ExtraBudgetAllocationDialogResult {
  readonly description: string;
  readonly amount: number;
}

@Component({
  selector: 'app-extra-budget-allocation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './extra-budget-allocation-dialog.component.html',
  styleUrl: './extra-budget-allocation-dialog.component.scss',
})
export class ExtraBudgetAllocationDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<ExtraBudgetAllocationDialogComponent, ExtraBudgetAllocationDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<ExtraBudgetAllocationDialogData>(MAT_DIALOG_DATA);
  protected readonly form = this.formBuilder.nonNullable.group({
    description: [
      `Extra budget - ${this.data.bullet.description}`,
      [Validators.required, Validators.maxLength(120)],
    ],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected submit(): void {
    if (this.form.invalid || !this.form.controls.description.getRawValue().trim()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      description: value.description.trim(),
      amount: value.amount,
    });
  }
}
