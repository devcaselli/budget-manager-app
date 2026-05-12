import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface InstallmentDeleteDialogData {
  readonly description: string;
}

@Component({
  selector: 'app-installment-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './installment-delete-dialog.component.html',
  styleUrl: './installment-delete-dialog.component.scss',
})
export class InstallmentDeleteDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<InstallmentDeleteDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<InstallmentDeleteDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
