import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { OmegaViewerDetail, OmegaViewerPayment } from '../models/omega-viewer-detail';
import { mapPaymentsToRows, OmegaViewerPaymentRow } from '../models/omega-viewer-payment-row';

/**
 * Payments section (F-09) — read-only list of a payment trace, rendered underneath
 * `ViewerNotesSectionComponent` while the shell is in `VIEW` mode. Only `EXPENSE` and
 * `INSTALLMENT` details carry a `payments` array (`OmegaViewerSubscriptionDetail` has none —
 * confirmed intentional, Subscription has no Payment/Expense link at all); the shell only
 * renders this component for those two kinds (see `omega-viewer.component.html`), so `detail`
 * is typed as the full union here purely so callers don't need a manual narrow, and
 * `paymentsOf()` below defensively returns `[]` for Subscription rather than assuming the
 * caller always gets the kind check right.
 *
 * Dumb/precomputed, same discipline as `ViewerFieldListComponent` (F-12): all formatting
 * (dates, currency, status derivation, payer-count label) happens once in the `rows`
 * `computed()`, never via a method call from the template.
 */
@Component({
  selector: 'app-viewer-payments-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './viewer-payments-section.component.html',
  styleUrl: './viewer-payments-section.component.scss',
})
export class ViewerPaymentsSectionComponent {
  readonly detail = input.required<OmegaViewerDetail>();

  protected readonly rows = computed<readonly OmegaViewerPaymentRow[]>(() =>
    mapPaymentsToRows(paymentsOf(this.detail())),
  );
}

function paymentsOf(detail: OmegaViewerDetail): readonly OmegaViewerPayment[] {
  switch (detail.kind) {
    case 'EXPENSE':
    case 'INSTALLMENT':
      return detail.payments;
    case 'SUBSCRIPTION':
      return [];
  }
}
