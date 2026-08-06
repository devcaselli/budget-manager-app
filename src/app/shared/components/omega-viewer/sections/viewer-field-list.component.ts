import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { OmegaViewerFieldRow, OmegaViewerRemainingBadge } from '../models/omega-viewer-field-row';

/**
 * Dumb/presentational — renders label/value rows and the installments-remaining badge that
 * were already fully resolved upstream (`omega-viewer-field-mapper.ts`, invoked from a
 * `computed()` in the shell). No mapping, no formatting, no lookups happen in here: the
 * template only binds to inputs, per F-12's "no method calls in template" requirement.
 */
@Component({
  selector: 'app-viewer-field-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './viewer-field-list.component.html',
  styleUrl: './viewer-field-list.component.scss',
})
export class ViewerFieldListComponent {
  readonly rows = input.required<readonly OmegaViewerFieldRow[]>();
  /** `{ kind: 'none' }` hides the badge; `{ kind: 'remaining', count }` renders it — `count`
   * of `0` (fully paid) is a valid, distinct state from the badge not appearing at all. */
  readonly remainingBadge = input<OmegaViewerRemainingBadge>({ kind: 'none' });
}
