import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface WalletConfirmDialogData {
  readonly titlePrefix: string;
  readonly titleEmphasis: string;
  readonly subtitle: string;
  readonly messagePrefix: string;
  readonly walletName: string;
  readonly messageSuffix: string;
  readonly confirmLabel: string;
  readonly confirmIcon: string;
  readonly tone?: 'danger' | 'positive';
}

@Component({
  selector: 'app-wallet-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './wallet-confirm-dialog.component.html',
  styleUrl: './wallet-confirm-dialog.component.scss',
})
export class WalletConfirmDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<WalletConfirmDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<WalletConfirmDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
