import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { Share } from '@features/share/models/share';

import { ShareFormComponent } from '../share-form/share-form.component';

export type ShareFormDialogResult = Share;

/**
 * Thin `MatDialog` framing around `ShareFormComponent` — hosts the form verbatim inside
 * `mat-dialog-content` (same pattern as `PendingReviewDialogComponent`: reuse the smart
 * component as-is rather than re-implementing its state in a wrapper). No submit button
 * here — `ShareFormComponent`'s own template already has one (`ew-btn-submit`), so this
 * frame only needs a "Cancel" action, matching the decision already taken for
 * `pending-review-dialog` (frontend-tasks.md Task 4, "não duplicar o botão de submit").
 *
 * Closes with the created `Share` on the form's `created` output, so the host page can
 * react (reload its listing) from `afterClosed()`.
 */
@Component({
  selector: 'app-share-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, ShareFormComponent],
  templateUrl: './share-form-dialog.component.html',
  styleUrl: './share-form-dialog.component.scss',
})
export class ShareFormDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<ShareFormDialogComponent, ShareFormDialogResult>>(MatDialogRef);

  protected onCreated(share: Share): void {
    this.dialogRef.close(share);
  }
}
