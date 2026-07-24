import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialogModule } from '@angular/material/dialog';

import { PendingReviewPage } from '../../pages/pending-review-page/pending-review-page';

/**
 * Thin `MatDialog` framing around `PendingReviewPage` — hosts the smart page
 * verbatim inside `mat-dialog-content`/`mat-dialog-actions` (decision closed in the
 * handoff/planning: reuse the whole page, not a separate wrapper that re-implements
 * loading/error/refetch). No inputs/outputs of its own: the page resolves its own
 * state via `PendingReviewService`, already shared with the dedicated route (Task 4).
 * "Confirm selected" lives inside `pending-review-list`'s own template, so this
 * frame only needs a "Close" action — it doesn't duplicate selection/confirm logic.
 *
 * `cdkDrag`/`cdkDragHandle` (first use of CDK drag&drop in the app — no other dialog
 * has this yet, and none is being retrofitted here) make the dialog draggable by its
 * header only: `cdkDragHandle` scopes the drag trigger to `.prd__head`, so dragging
 * inside `mat-dialog-content`/`mat-dialog-actions` (body scroll, form inputs, buttons)
 * behaves normally. `cdkDragRootElement` targets Material's own dialog container so the
 * whole panel moves as a unit instead of just this component's inner root.
 */
@Component({
  selector: 'app-pending-review-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, DragDropModule, PendingReviewPage],
  templateUrl: './pending-review-dialog.component.html',
  styleUrl: './pending-review-dialog.component.scss',
})
export class PendingReviewDialogComponent {}
