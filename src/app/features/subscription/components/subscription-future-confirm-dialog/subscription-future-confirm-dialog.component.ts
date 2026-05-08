import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface SubscriptionFutureConfirmDialogData {
  readonly description: string;
  readonly effectiveMonth: string;
  readonly state: string;
}

@Component({
  selector: 'app-subscription-future-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './subscription-future-confirm-dialog.component.html',
  styleUrl: './subscription-future-confirm-dialog.component.scss',
})
export class SubscriptionFutureConfirmDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<SubscriptionFutureConfirmDialogComponent, boolean>
  >(MatDialogRef);

  protected readonly data = inject<SubscriptionFutureConfirmDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
