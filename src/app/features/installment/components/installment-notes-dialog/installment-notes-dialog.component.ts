import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface InstallmentNotesDialogData {
  readonly description: string;
  readonly details: string | null | undefined;
}

export interface InstallmentNotesDialogResult {
  readonly details: string | null;
}

@Component({
  selector: 'app-installment-notes-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './installment-notes-dialog.component.html',
  styleUrl: './installment-notes-dialog.component.scss',
})
export class InstallmentNotesDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<InstallmentNotesDialogComponent, InstallmentNotesDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<InstallmentNotesDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.formBuilder.nonNullable.group({
    details: [this.data.details ?? '', Validators.maxLength(500)],
  });

  protected get remaining(): number {
    return 500 - (this.form.controls.details.value?.length ?? 0);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const details = this.form.controls.details.value.trim();
    this.dialogRef.close({ details: details || null });
  }
}
