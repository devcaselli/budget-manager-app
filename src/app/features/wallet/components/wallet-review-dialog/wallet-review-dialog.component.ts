import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface WalletReviewDialogData {
  readonly walletDescription: string;
}

@Component({
  selector: 'app-wallet-review-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './wallet-review-dialog.component.html',
  styleUrl: './wallet-review-dialog.component.scss',
})
export class WalletReviewDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<WalletReviewDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<WalletReviewDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
