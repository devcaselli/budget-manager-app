import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';

export interface ExpenseCreateDialogBullet {
  readonly id: string;
  readonly description: string;
  readonly remaining: string;
}

export interface ExpenseCreateDialogCreditCard {
  readonly id: string;
  readonly name: string;
}

export interface ExpenseCreateDialogData {
  readonly walletDescription: string;
  readonly bullets?: readonly ExpenseCreateDialogBullet[];
  readonly creditCards?: readonly ExpenseCreateDialogCreditCard[];
}

export interface ExpenseCreateDialogResult {
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;
  readonly bulletId?: string;
  /** Required by API — always sent */
  readonly creditCardId: string;
  readonly installment?: boolean;
  readonly installmentNumber?: number;
}

@Component({
  selector: 'app-expense-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    ReactiveFormsModule,
  ],
  templateUrl: './expense-create-dialog.component.html',
  styleUrl: './expense-create-dialog.component.scss',
})
export class ExpenseCreateDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<ExpenseCreateDialogComponent, ExpenseCreateDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  @ViewChild('nameInput') private readonly nameInput?: ElementRef<HTMLInputElement>;

  readonly submitted = new Subject<ExpenseCreateDialogResult>();

  protected readonly data = inject<ExpenseCreateDialogData>(MAT_DIALOG_DATA);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: [this.today(), Validators.required],
    bulletId: [''],
    creditCardId: ['', Validators.required],
    isInstallment: [false],
    installmentCharges: [0],
    keepOpen: [false],
  });

  protected get hasBullets(): boolean {
    return (this.data.bullets?.length ?? 0) > 0;
  }

  protected get hasCreditCards(): boolean {
    return (this.data.creditCards?.length ?? 0) > 0;
  }

  protected get showInstallments(): boolean {
    return this.form.controls.isInstallment.value;
  }

  protected toggleInstallment(): void {
    const current = this.form.controls.isInstallment.value;
    this.form.controls.isInstallment.setValue(!current);

    if (!current) {
      this.form.controls.installmentCharges.setValidators([Validators.required, Validators.min(2)]);
    } else {
      this.form.controls.installmentCharges.clearValidators();
      this.form.controls.installmentCharges.setValue(0);
    }
    this.form.controls.installmentCharges.updateValueAndValidity();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const isInstallment = value.isInstallment;
    const charges = value.installmentCharges;

    const result: ExpenseCreateDialogResult = {
      name: value.name.trim(),
      cost: value.cost,
      purchaseDate: value.purchaseDate,
      creditCardId: value.creditCardId,
      ...(value.bulletId ? { bulletId: value.bulletId } : {}),
      ...(isInstallment && charges >= 2
        ? { installment: true, installmentNumber: charges }
        : {}),
    };

    if (value.keepOpen) {
      this.submitted.next(result);
      this.resetForNextTransaction(value.purchaseDate);
      return;
    }

    this.dialogRef.close(result);
  }

  private resetForNextTransaction(purchaseDate: string): void {
    this.form.controls.installmentCharges.clearValidators();
    this.form.controls.installmentCharges.updateValueAndValidity();
    this.form.patchValue({
      name: '',
      cost: 0,
      purchaseDate,
      bulletId: '',
      creditCardId: '',
      isInstallment: false,
      installmentCharges: 0,
      keepOpen: true,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    setTimeout(() => this.nameInput?.nativeElement.focus());
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
