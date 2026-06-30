import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface BulletEditDialogData {
  readonly bulletDescription: string;
  readonly budget: number;
  readonly walletDescription: string;
}

export interface BulletEditDialogResult {
  readonly description: string;
  readonly budget: number;
}

const DESCRIPTION_MAX_LENGTH = 120;
const MIN_BUDGET = 0.01;

@Component({
  selector: 'app-bullet-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './bullet-edit-dialog.component.html',
  styleUrl: './bullet-edit-dialog.component.scss',
})
export class BulletEditDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<BulletEditDialogComponent, BulletEditDialogResult>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<BulletEditDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.formBuilder.nonNullable.group({
    description: [
      this.data.bulletDescription,
      [Validators.required, Validators.maxLength(DESCRIPTION_MAX_LENGTH)],
    ],
    budget: [this.data.budget, [Validators.required, Validators.min(MIN_BUDGET)]],
  });

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({ description: value.description.trim(), budget: value.budget });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
