import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { PatchInstallmentRequest } from '../../models/installment';

export interface InstallmentEditDialogCreditCard {
  readonly id: string;
  readonly name: string;
}

export interface InstallmentEditDialogData {
  readonly id: string;
  readonly description: string;
  readonly installmentValue: number;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly sourceEffectiveMonth: string;
  readonly creditCardId: string;
  readonly creditCards: readonly InstallmentEditDialogCreditCard[];
}

export type InstallmentEditDialogResult = Omit<PatchInstallmentRequest, 'details'>;

@Component({
  selector: 'app-installment-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './installment-edit-dialog.component.html',
  styleUrl: './installment-edit-dialog.component.scss',
})
export class InstallmentEditDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<InstallmentEditDialogComponent, InstallmentEditDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<InstallmentEditDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.formBuilder.nonNullable.group({
    installmentValue: [this.data.installmentValue, [Validators.required, Validators.min(0.01)]],
    installmentNumber: [this.data.installmentNumber, [Validators.required, Validators.min(2), Validators.max(120)]],
    purchaseDate: [this.data.purchaseDate, Validators.required],
    sourceEffectiveMonth: [this.data.sourceEffectiveMonth, Validators.required],
    creditCardId: [this.data.creditCardId, Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.dialogRef.close({
      installmentValue: v.installmentValue,
      installmentNumber: v.installmentNumber,
      purchaseDate: v.purchaseDate,
      sourceEffectiveMonth: v.sourceEffectiveMonth,
      creditCardId: v.creditCardId,
    });
  }
}
