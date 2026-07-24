import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';

import { PendingReviewPage } from '../../pages/pending-review-page/pending-review-page';

/**
 * Thin `MatDialog` framing around `PendingReviewPage` — hosts the smart page
 * verbatim inside `mat-dialog-content`/`mat-dialog-actions` (decision closed in the
 * handoff/planning: reuse the whole page, not a separate wrapper that re-implements
 * loading/error/refetch). No inputs/outputs of its own: the page resolves its own
 * state via `PendingReviewService`, already shared with the dedicated route (Task 4).
 * "Confirmar selecionados" lives inside `pending-review-list`'s own template, so this
 * frame only needs a "Fechar" action — it doesn't duplicate selection/confirm logic.
 */
@Component({
  selector: 'app-pending-review-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, PendingReviewPage],
  templateUrl: './pending-review-dialog.component.html',
  styleUrl: './pending-review-dialog.component.scss',
})
export class PendingReviewDialogComponent {}
