import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/**
 * "Discard unsaved changes?" confirmation, shown by the Omega Viewer shell (F-07) whenever
 * the edit form is dirty and the user tries to navigate away, go back, or close the modal.
 * Follows the same bespoke-per-feature confirm-dialog shape already used elsewhere in the
 * project (`ExpenseDeleteDialogComponent`, `SubscriptionFutureConfirmDialogComponent`) —
 * there is no shared generic confirm dialog component to reuse, so this mirrors their
 * pattern rather than inventing a new one.
 */
@Component({
  selector: 'app-viewer-discard-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './viewer-discard-confirm-dialog.component.html',
  styleUrl: './viewer-discard-confirm-dialog.component.scss',
})
export class ViewerDiscardConfirmDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<ViewerDiscardConfirmDialogComponent, boolean>>(MatDialogRef);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
