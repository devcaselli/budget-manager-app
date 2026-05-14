import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { Subject } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface InstallmentCreateDialogCreditCard {
  readonly id: string;
  readonly name: string;
}

export interface InstallmentCreateDialogData {
  readonly creditCards: readonly InstallmentCreateDialogCreditCard[];
}

export type ValueMode = 'installment' | 'original';

export interface InstallmentCreateDialogResult {
  readonly description: string;
  readonly originalValue?: number;
  readonly installmentValue?: number;
  readonly currency: string;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly creditCardId: string;
  readonly sourceEffectiveMonth: string;
}

@Component({
  selector: 'app-installment-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './installment-create-dialog.component.html',
  styleUrl: './installment-create-dialog.component.scss',
})
export class InstallmentCreateDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<InstallmentCreateDialogComponent, InstallmentCreateDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  @ViewChild('descriptionInput') private readonly descriptionInput?: ElementRef<HTMLInputElement>;

  protected readonly data = inject<InstallmentCreateDialogData>(MAT_DIALOG_DATA);

  readonly submitted = new Subject<InstallmentCreateDialogResult>();

  protected valueMode: ValueMode = 'installment';

  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['BRL', Validators.required],
    installmentNumber: [2, [Validators.required, Validators.min(2), Validators.max(120)]],
    purchaseDate: [this.today(), Validators.required],
    creditCardId: ['', Validators.required],
    sourceEffectiveMonth: [this.currentMonthIso(), Validators.required],
    keepOpen: [false],
  });

  protected get valueModeLabel(): string {
    return this.valueMode === 'installment' ? 'Installment value (per charge)' : 'Original value (total)';
  }

  protected get valuePlaceholder(): string {
    return this.valueMode === 'installment' ? 'e.g. 150.00 / month' : 'e.g. 1800.00 total';
  }

  protected toggleValueMode(): void {
    this.valueMode = this.valueMode === 'installment' ? 'original' : 'installment';
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const result: InstallmentCreateDialogResult = {
      description: value.description.trim(),
      currency: value.currency,
      installmentNumber: value.installmentNumber,
      purchaseDate: value.purchaseDate,
      creditCardId: value.creditCardId,
      sourceEffectiveMonth: value.sourceEffectiveMonth,
      ...(this.valueMode === 'installment'
        ? { installmentValue: value.amount }
        : { originalValue: value.amount }),
    };

    if (value.keepOpen) {
      this.submitted.next(result);
      this.resetForNext(value.purchaseDate, value.sourceEffectiveMonth, value.creditCardId, value.currency);
      return;
    }

    this.dialogRef.close(result);
  }

  private resetForNext(purchaseDate: string, sourceEffectiveMonth: string, creditCardId: string, currency: string): void {
    this.form.patchValue({
      description: '',
      amount: 0,
      installmentNumber: 2,
      purchaseDate,
      sourceEffectiveMonth,
      creditCardId,
      currency,
      keepOpen: true,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    setTimeout(() => this.descriptionInput?.nativeElement.focus());
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private currentMonthIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
