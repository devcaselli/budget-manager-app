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

import { PreferencesService } from '@core/services/preferences.service';

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
  protected readonly prefs = inject(PreferencesService);

  @ViewChild('nameInput') private readonly nameInput?: ElementRef<HTMLInputElement>;

  readonly submitted = new Subject<ExpenseCreateDialogResult>();

  protected readonly data = inject<ExpenseCreateDialogData>(MAT_DIALOG_DATA);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: [this.today(), Validators.required],
    bulletId: [''],
    // P2-4: pre-filled from PreferencesService.rememberedCreditCardId when "Remember
    // the selected card" is on and that card still exists in this wallet's list.
    creditCardId: [this.resolveInitialCreditCardId(), Validators.required],
    isInstallment: [false],
    installmentCharges: [0],
    keepOpen: [false],
    keepCreditCard: [false],
  });

  private resolveInitialCreditCardId(): string {
    if (!this.prefs.rememberCard()) return '';
    const rememberedId = this.prefs.rememberedCreditCardId();
    if (!rememberedId) return '';
    const existsInList = (this.data.creditCards ?? []).some((card) => card.id === rememberedId);
    return existsInList ? rememberedId : '';
  }

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

    if (this.prefs.rememberCard()) {
      this.prefs.setRememberedCreditCardId(value.creditCardId || null);
    }

    if (value.keepOpen) {
      this.submitted.next(result);
      this.resetForNextTransaction(value.purchaseDate);
      return;
    }

    this.dialogRef.close(result);
  }

  /** "Remember the selected card" toggle (P2-4) — persists via `PreferencesService`,
   *  independent of this dialog's own `keepOpen`/`keepCreditCard` in-session state. */
  protected toggleRememberCard(): void {
    this.prefs.toggleRememberCard();
  }

  private resetForNextTransaction(purchaseDate: string): void {
    const currentCreditCardId = this.form.controls.creditCardId.getRawValue();
    const keepCreditCard = this.form.controls.keepCreditCard.getRawValue();

    this.form.controls.installmentCharges.clearValidators();
    this.form.controls.installmentCharges.updateValueAndValidity();
    this.form.patchValue({
      name: '',
      cost: 0,
      purchaseDate,
      bulletId: '',
      creditCardId: keepCreditCard ? currentCreditCardId : '',
      isInstallment: false,
      installmentCharges: 0,
      keepOpen: true,
      keepCreditCard,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    setTimeout(() => this.nameInput?.nativeElement.focus());
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
