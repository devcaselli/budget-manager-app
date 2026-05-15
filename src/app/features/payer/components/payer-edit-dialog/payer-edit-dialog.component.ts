import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { PatchPayerRequest, PayerType } from '../../models/payer';

export interface PayerEditDialogData {
  readonly id: string;
  readonly name: string;
  readonly type: PayerType;
  readonly walletId: string | null;
  readonly selectedWalletId?: string | null;
  readonly paymentDate: string;
  readonly subscriptionId: string | null;
}

export type PayerEditDialogResult = PatchPayerRequest;

const PAYER_TYPES: readonly { value: PayerType; label: string }[] = [
  { value: 'STANDING', label: 'Standing' },
  { value: 'TRANSIENT', label: 'Transient' },
];

@Component({
  selector: 'app-payer-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './payer-edit-dialog.component.html',
  styleUrl: './payer-edit-dialog.component.scss',
})
export class PayerEditDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<PayerEditDialogComponent, PayerEditDialogResult>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<PayerEditDialogData>(MAT_DIALOG_DATA);
  protected readonly payerTypes = PAYER_TYPES;
  protected readonly needsWallet = computed(() => this.form.controls.type.getRawValue() === 'TRANSIENT');

  protected readonly form = this.formBuilder.nonNullable.group({
    name:           [this.data.name, [Validators.required, Validators.maxLength(120)]],
    type:           [this.data.type, Validators.required],
    paymentDate:    [this.data.paymentDate, Validators.required],
    subscriptionId: [this.data.subscriptionId ?? ''],
  });

  protected submit(): void {
    if (this.needsWallet() && !this.data.selectedWalletId && !this.data.walletId) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const result: PayerEditDialogResult = {
      name:        value.name.trim(),
      type:        value.type,
      paymentDate: value.paymentDate,
      subscriptionId: value.subscriptionId.trim() || undefined,
    };

    this.dialogRef.close(result);
  }
}
