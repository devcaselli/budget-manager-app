import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/** Data the F-10 "confirm revert" dialog needs to render a specific message — the payment's
 * already-formatted date label (`OmegaViewerPaymentRow.dateLabel`), not a raw ISO string. */
export interface ViewerRevertConfirmDialogData {
  readonly dateLabel: string;
  /** Overrides the default payment-revert body text when the reverted action isn't a payment
   * (e.g. a reserved-budget migration, which moves an amount between two places rather than
   * creating a reversal payment) — RBM-F7. Existing callers omit this and keep the default
   * copy untouched. */
  readonly bodyOverride?: string;
}

/**
 * "Confirm payment revert?" dialog (F-10) — shown by `ViewerPaymentsSectionComponent`/the
 * Omega Viewer shell before calling `PaymentService.revert()`. A separate component from
 * `ViewerDiscardConfirmDialogComponent` rather than a reuse: that dialog's copy/icon/button
 * ("Descartar alterações?", `delete_outline`, red "Descartar alterações" button) is written
 * specifically for the "you have unsaved form edits" scenario, and this feature's own
 * convention (see that component's doc comment) is bespoke-per-feature confirm dialogs rather
 * than a shared generic one — reverting a payment is a materially different, irreversible
 * ledger action with its own message, not a discard.
 *
 * RBM-F7: also reused outside the Omega Viewer, by `ReservedBudgetPage` to confirm undoing a
 * migration — via `data.bodyOverride`, which replaces the payment-specific body paragraph with
 * a caller-supplied message. The header/date-subtitle/actions stay the generic "confirm a
 * revert" chrome; only the body text is caller-specific.
 */
@Component({
  selector: 'app-viewer-revert-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './viewer-revert-confirm-dialog.component.html',
  styleUrl: './viewer-revert-confirm-dialog.component.scss',
})
export class ViewerRevertConfirmDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<ViewerRevertConfirmDialogComponent, boolean>>(MatDialogRef);
  protected readonly data = inject<ViewerRevertConfirmDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
