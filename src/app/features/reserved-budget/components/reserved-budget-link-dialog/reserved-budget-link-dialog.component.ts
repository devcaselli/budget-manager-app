import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ReservedBudgetLinkSourceType } from '../../models/reserved-budget';

export interface ReservedBudgetLinkSourceOption {
  readonly id: string;
  readonly label: string;
}

export interface ReservedBudgetLinkDialogData {
  readonly reservedBudgetDescription: string;
  readonly subscriptions: readonly ReservedBudgetLinkSourceOption[];
  readonly installments: readonly ReservedBudgetLinkSourceOption[];
  readonly hasWallet: boolean;
}

export interface ReservedBudgetLinkDialogResult {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  readonly fromMonth: string;
}

@Component({
  selector: 'app-reserved-budget-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './reserved-budget-link-dialog.component.html',
  styleUrl: './reserved-budget-link-dialog.component.scss',
})
export class ReservedBudgetLinkDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<ReservedBudgetLinkDialogComponent, ReservedBudgetLinkDialogResult>>(
      MatDialogRef,
    );
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<ReservedBudgetLinkDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.formBuilder.nonNullable.group({
    sourceType: ['SUBSCRIPTION' as ReservedBudgetLinkSourceType, Validators.required],
    sourceId: ['', Validators.required],
    fromMonth: [this.currentMonth(), Validators.required],
  });

  private readonly sourceType = toSignal(this.form.controls.sourceType.valueChanges, {
    initialValue: this.form.controls.sourceType.value,
  });

  protected readonly options = computed<readonly ReservedBudgetLinkSourceOption[]>(() =>
    this.sourceType() === 'SUBSCRIPTION' ? this.data.subscriptions : this.data.installments,
  );

  // Installments are wallet-scoped; without an active wallet the list cannot be loaded.
  protected readonly installmentsBlocked = computed(
    () => this.sourceType() === 'INSTALLMENT' && !this.data.hasWallet,
  );

  protected confirm(): void {
    if (this.installmentsBlocked() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      sourceType: value.sourceType,
      sourceId: value.sourceId,
      fromMonth: value.fromMonth,
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  protected onSourceTypeChange(): void {
    this.form.controls.sourceId.reset('');
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
