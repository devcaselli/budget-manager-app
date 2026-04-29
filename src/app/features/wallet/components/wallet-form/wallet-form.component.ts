import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { CreateWalletRequest } from '../../models/wallet';

@Component({
  selector: 'app-wallet-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  templateUrl: './wallet-form.component.html',
  styleUrl: './wallet-form.component.scss',
})
export class WalletFormComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly isSaving = input(false);
  readonly resetCount = input(0);
  readonly walletCreate = output<CreateWalletRequest>();

  protected readonly form = this.formBuilder.nonNullable.group({
    description: [''],
    budget: [0, [Validators.required, Validators.min(0.01)]],
    startDate: [this.today(), Validators.required],
    closedDate: [''],
    closed: [false],
  });

  constructor() {
    effect(() => {
      if (this.resetCount() > 0) {
        this.resetForm();
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.walletCreate.emit({
      description: value.description.trim() || null,
      budget: value.budget,
      startDate: value.startDate,
      closedDate: value.closedDate || null,
      closed: value.closed,
    });
  }

  private resetForm(): void {
    this.form.reset({
      description: '',
      budget: 0,
      startDate: this.today(),
      closedDate: '',
      closed: false,
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
