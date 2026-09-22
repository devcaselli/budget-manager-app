import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { OmegaViewerDetail, OmegaViewerPayment } from '../models/omega-viewer-detail';
import { mapPaymentsToRows, OmegaViewerPaymentRow } from '../models/omega-viewer-payment-row';

/**
 * Payments section (F-09/F-10) — list of a payment trace, rendered underneath
 * `ViewerNotesSectionComponent` while the shell is in `VIEW` mode. Only `EXPENSE` and
 * `INSTALLMENT` details carry a `payments` array (`OmegaViewerSubscriptionDetail` has none —
 * confirmed intentional, Subscription has no Payment/Expense link at all); the shell only
 * renders this component for those two kinds (see `omega-viewer.component.html`), so `detail`
 * is typed as the full union here purely so callers don't need a manual narrow, and
 * `paymentsOf()` below defensively returns `[]` for Subscription rather than assuming the
 * caller always gets the kind check right.
 *
 * Dumb/precomputed, same discipline as `ViewerFieldListComponent` (F-12): all formatting
 * (dates, currency, status derivation, payer-count label, revert-eligibility) happens once in
 * the `rows` `computed()`, never via a method call from the template.
 *
 * F-10 (revert): this component does NOT own the confirmation dialog or the HTTP call — same
 * split as `ViewerNotesSectionComponent`/`ViewerEditFormComponent` (dumb section emits, shell
 * owns side effects). `requestRevert` fires on a row's revert button click; the shell opens
 * `ViewerRevertConfirmDialogComponent`, calls `PaymentService.revert()` on confirm, and passes
 * `revertingId`/`revertError` back down here so exactly one row can show a spinner/error at a
 * time.
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
  /** Id of the payment currently being reverted (shell-owned, mirrors
   * `PaymentService.reverting$`), `null` when no revert is in flight. Drives the per-row
   * spinner/disabled state. */
  readonly revertingId = input<string | null>(null);
  /** Shell-owned message for the most recent failed revert attempt — rendered inline,
   * `role="alert"`, same convention as `ViewerEditFormComponent.saveError`/
   * `ViewerNotesSectionComponent.saveError` (code review C2 in this same feature already
   * flagged a silently-dropped error as critical once; this section must not repeat that). */
  readonly revertError = input<string | null>(null);

  /** Emits the `OmegaViewerPayment` the user clicked "Reverter" on — the shell opens the
   * confirm dialog and calls `PaymentService.revert()`. */
  readonly requestRevert = output<OmegaViewerPayment>();

  protected readonly rows = computed<readonly OmegaViewerPaymentRow[]>(() =>
    mapPaymentsToRows(paymentsOf(this.detail())),
  );

  protected onRevertClick(row: OmegaViewerPaymentRow): void {
    this.requestRevert.emit(row.payment);
  }
}

function paymentsOf(detail: OmegaViewerDetail): readonly OmegaViewerPayment[] {
  switch (detail.kind) {
    case 'EXPENSE':
    case 'INSTALLMENT':
      return detail.payments;
    case 'SUBSCRIPTION':
      return [];
    // A migration is not a payment-bearing kind (see the class doc's honest-guard note) — the
    // shell also never renders this section for it (showPaymentsSection()/RBM-F14).
    case 'RESERVED_BUDGET_MIGRATION':
      return [];
  }
}
