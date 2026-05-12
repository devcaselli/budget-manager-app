import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface CreditCardDeleteDialogData {
  readonly cardName: string;
}

@Component({
  selector: 'app-credit-card-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './credit-card-delete-dialog.component.html',
  styleUrl: './credit-card-delete-dialog.component.scss',
})
export class CreditCardDeleteDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<CreditCardDeleteDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<CreditCardDeleteDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
