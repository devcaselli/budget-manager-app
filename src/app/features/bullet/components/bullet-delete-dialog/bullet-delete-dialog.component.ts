import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface BulletDeleteDialogData {
  readonly bulletDescription: string;
  readonly walletDescription: string;
  readonly allocatedAmount: number;
}

@Component({
  selector: 'app-bullet-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './bullet-delete-dialog.component.html',
  styleUrl: './bullet-delete-dialog.component.scss',
})
export class BulletDeleteDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<BulletDeleteDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<BulletDeleteDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
