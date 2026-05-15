import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { CreatePayerRequest, PayerType } from '../../models/payer';

export interface PayerCreateDialogData {
  readonly placeholder?: never;
}

export type PayerCreateDialogResult = CreatePayerRequest;

const PAYER_TYPES: readonly { value: PayerType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'COMPANY',    label: 'Company' },
  { value: 'DEPENDENT',  label: 'Dependent' },
  { value: 'OTHER',      label: 'Other' },
];

@Component({
  selector: 'app-payer-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './payer-create-dialog.component.html',
  styleUrl: './payer-create-dialog.component.scss',
})
export class PayerCreateDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<PayerCreateDialogComponent, PayerCreateDialogResult>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<PayerCreateDialogData>(MAT_DIALOG_DATA);
  protected readonly payerTypes = PAYER_TYPES;

  protected readonly form = this.formBuilder.nonNullable.group({
    name:           ['', [Validators.required, Validators.maxLength(120)]],
    type:           ['INDIVIDUAL' as PayerType, Validators.required],
    paymentDate:    [this.today(), Validators.required],
    subscriptionId: [''],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const result: PayerCreateDialogResult = {
      name:        value.name.trim(),
      type:        value.type,
      paymentDate: value.paymentDate,
      ...(value.subscriptionId.trim() ? { subscriptionId: value.subscriptionId.trim() } : {}),
    };

    this.dialogRef.close(result);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
