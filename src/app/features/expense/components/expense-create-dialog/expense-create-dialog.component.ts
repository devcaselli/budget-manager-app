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

export interface ExpenseCreateDialogData {
  readonly walletDescription: string;
  readonly bullets?: readonly ExpenseCreateDialogBullet[];
}

export interface ExpenseCreateDialogResult {
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;
  readonly bulletId?: string;
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
    keepOpen: [false],
  });

  protected get hasBullets(): boolean {
    return (this.data.bullets?.length ?? 0) > 0;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const result: ExpenseCreateDialogResult = {
      name: value.name.trim(),
      cost: value.cost,
      purchaseDate: value.purchaseDate,
      ...(value.bulletId ? { bulletId: value.bulletId } : {}),
    };

    if (value.keepOpen) {
      this.submitted.next(result);
      this.resetForNextTransaction(value.purchaseDate);
      return;
    }

    this.dialogRef.close(result);
  }

  private resetForNextTransaction(purchaseDate: string): void {
    this.form.patchValue({
      name: '',
      cost: 0,
      purchaseDate,
      bulletId: '',
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
