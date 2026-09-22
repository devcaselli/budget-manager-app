import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerPayment,
  OmegaViewerSubscriptionDetail,
} from '../models/omega-viewer-detail';
import { formatBrl } from '@shared/utils/currency';

import { ViewerPaymentsSectionComponent } from './viewer-payments-section.component';

function buildPayment(overrides: Partial<OmegaViewerPayment> = {}): OmegaViewerPayment {
  return {
    id: 'payment-1',
    amount: 120,
    paymentDate: '2026-04-29T12:00:00.000Z',
    bulletId: 'bullet-1',
    bulletDescription: 'Mercado',
    reversal: false,
    reversed: false,
    reversedPaymentId: null,
    payerIds: ['payer-1'],
    kind: 'NORMAL',
    ...overrides,
  };
}

function buildExpenseDetail(
  overrides: Partial<OmegaViewerExpenseDetail> = {},
): OmegaViewerExpenseDetail {
  return {
    kind: 'EXPENSE',
    ref: { kind: 'EXPENSE', id: 'expense-1' },
    name: 'Groceries',
    cost: 100,
    remaining: 40,
    purchaseDate: '2026-07-01',
    creditCardId: 'card-1',
    details: null,
    tagIds: [],
    payerName: null,
    payments: [],
    installmentsRemaining: null,
    links: [],
    audit: null,
    ...overrides,
  };
}

function buildInstallmentDetail(
  overrides: Partial<OmegaViewerInstallmentDetail> = {},
): OmegaViewerInstallmentDetail {
  return {
    kind: 'INSTALLMENT',
    ref: { kind: 'INSTALLMENT', id: 'installment-1' },
    description: 'Laptop',
    originalValue: 3000,
    installmentValue: 250,
    installmentNumber: 12,
    purchaseDate: '2026-01-01',
    lastInstallmentDate: '2026-12-01',
    creditCardId: 'card-1',
    details: null,
    tagIds: [],
    payerName: null,
    progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
    payments: [],
    links: [],
    audit: null,
    ...overrides,
  };
}

function buildSubscriptionDetail(
  overrides: Partial<OmegaViewerSubscriptionDetail> = {},
): OmegaViewerSubscriptionDetail {
  return {
    kind: 'SUBSCRIPTION',
    ref: { kind: 'SUBSCRIPTION', id: 'subscription-1' },
    description: 'Netflix',
    currency: 'BRL',
    state: 'PRODUCTION',
    startMonth: '2026-01',
    endMonth: null,
    creditCardId: 'card-1',
    details: null,
    tagIds: [],
    payerName: null,
    links: [],
    audit: null,
    ...overrides,
  };
}

describe('ViewerPaymentsSectionComponent', () => {
  let fixture: ComponentFixture<ViewerPaymentsSectionComponent>;

  function setup(detail: OmegaViewerDetail): void {
    TestBed.configureTestingModule({ imports: [ViewerPaymentsSectionComponent] });
    fixture = TestBed.createComponent(ViewerPaymentsSectionComponent);
    fixture.componentRef.setInput('detail', detail);
    fixture.detectChanges();
  }

  it('shows the empty state when there are no payments', () => {
    setup(buildExpenseDetail({ payments: [] }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.vps__empty')?.textContent).toContain(
      'No payments recorded.',
    );
    expect(root.querySelectorAll('.vps__row').length).toBe(0);
  });

  it('renders one row per payment, in O(P) — no nested loop over payments', () => {
    const payments = [
      buildPayment({ id: 'p1' }),
      buildPayment({ id: 'p2' }),
      buildPayment({ id: 'p3' }),
    ];
    setup(buildExpenseDetail({ payments }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.vps__row').length).toBe(3);
  });

  it('renders the bullet description and blurs the amount', () => {
    setup(
      buildExpenseDetail({
        payments: [buildPayment({ bulletDescription: 'Aluguel', amount: 1500 })],
      }),
    );

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.vps__bullet')?.textContent).toContain('Aluguel');
    const amountEl = root.querySelector('.vps__amount');
    expect(amountEl?.classList.contains('ew-blur')).toBe(true);
    expect(amountEl?.textContent).toContain('1.500,00');
  });

  it('marks a normal payment (not reversal, not reversed) distinctly', () => {
    setup(
      buildExpenseDetail({
        payments: [buildPayment({ reversal: false, reversed: false })],
      }),
    );

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="payment-status-normal"]')).not.toBeNull();
    expect(root.querySelector('.vps__row')?.classList.contains('vps__row--reversal')).toBe(false);
    expect(root.querySelector('.vps__row')?.classList.contains('vps__row--reversed')).toBe(false);
  });

  it('marks a payment that IS a reversal distinctly from a payment that WAS reversed', () => {
    setup(
      buildExpenseDetail({
        payments: [buildPayment({ id: 'p-reversal', reversal: true, reversed: false })],
      }),
    );

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="payment-status-reversal"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="payment-status-reversed"]')).toBeNull();
    expect(root.querySelector('.vps__row')?.classList.contains('vps__row--reversal')).toBe(true);
  });

  it('marks a payment that WAS reversed distinctly from a reversal payment', () => {
    setup(
      buildExpenseDetail({
        payments: [buildPayment({ id: 'p-reversed', reversal: false, reversed: true })],
      }),
    );

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="payment-status-reversed"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="payment-status-reversal"]')).toBeNull();
    expect(root.querySelector('.vps__row')?.classList.contains('vps__row--reversed')).toBe(true);
  });

  it('shows a payer count, not raw payer ids, for a single payer', () => {
    setup(buildExpenseDetail({ payments: [buildPayment({ payerIds: ['payer-1'] })] }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.vps__payer')?.textContent).toContain('1 pagador');
    expect(root.querySelector('.vps__payer')?.textContent).not.toContain('payer-1');
  });

  it('shows a plural payer count for a shared payment', () => {
    setup(buildExpenseDetail({ payments: [buildPayment({ payerIds: ['payer-1', 'payer-2'] })] }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.vps__payer')?.textContent).toContain('2 pagadores');
  });

  it('renders Installment payments the same way as Expense payments', () => {
    setup(buildInstallmentDetail({ payments: [buildPayment({ id: 'installment-payment-1' })] }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.vps__row').length).toBe(1);
  });

  it('renders the empty state for Subscription, which never has a payments array', () => {
    setup(buildSubscriptionDetail());

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.vps__empty')).not.toBeNull();
  });

  it('tracks rows by payment id (trackBy), not array index', () => {
    setup(buildExpenseDetail({ payments: [buildPayment({ id: 'stable-id' })] }));

    const before = (fixture.nativeElement as HTMLElement).querySelector('.vps__row');

    fixture.componentRef.setInput(
      'detail',
      buildExpenseDetail({ payments: [buildPayment({ id: 'stable-id', amount: 999 })] }),
    );
    fixture.detectChanges();

    const after = (fixture.nativeElement as HTMLElement).querySelector('.vps__row');
    expect(after).toBe(before);
  });

  describe('F-10 — revert action', () => {
    it('shows a revert button for an eligible payment (NORMAL, not reversal, not reversed)', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1', reversal: false, reversed: false })],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      const button = root.querySelector('.vps__revert-btn');
      expect(button).not.toBeNull();
      expect(button?.getAttribute('aria-label')).toBe('Revert payment from 29/04/2026');
      expect(root.querySelector('[data-testid="payment-ineligible-hint"]')).toBeNull();
    });

    it('hides the revert button and shows an explanatory hint for a reversal payment', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1', reversal: true, reversed: false })],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vps__revert-btn')).toBeNull();
      const hint = root.querySelector('[data-testid="payment-ineligible-hint"]');
      expect(hint).not.toBeNull();
      expect(hint?.getAttribute('title')).toContain('is a reversal');
    });

    it('hides the revert button and shows an explanatory hint for an already-reverted payment', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1', reversal: false, reversed: true })],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vps__revert-btn')).toBeNull();
      const hint = root.querySelector('[data-testid="payment-ineligible-hint"]');
      expect(hint).not.toBeNull();
      expect(hint?.getAttribute('title')).toContain('has already been reverted');
    });

    it('hides the revert button for a SHARED payment and shows the Share hint on hover, before any click', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1', kind: 'SHARED', reversal: false, reversed: false })],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vps__revert-btn')).toBeNull();
      const hint = root.querySelector('[data-testid="payment-ineligible-hint"]');
      expect(hint).not.toBeNull();
      expect(hint?.getAttribute('title')).toBe(
        'Shared payments are reverted from the Share screen.',
      );
      // No click happened and no revertError input was set — the hint is reachable purely
      // from `kind`, not as a byproduct of a failed revert attempt.
      expect(root.querySelector('.ew-alert[role="alert"]')).toBeNull();
    });

    it('a NORMAL, eligible payment keeps showing the revert button, unaffected by the new kind field', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1', kind: 'NORMAL', reversal: false, reversed: false })],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vps__revert-btn')).not.toBeNull();
      expect(root.querySelector('[data-testid="payment-ineligible-hint"]')).toBeNull();
    });

    it('emits requestRevert with the underlying OmegaViewerPayment on click', () => {
      const payment = buildPayment({ id: 'p1', reversal: false, reversed: false });
      setup(buildExpenseDetail({ payments: [payment] }));

      let emitted: OmegaViewerPayment | undefined;
      fixture.componentInstance.requestRevert.subscribe((value) => (emitted = value));

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('.vps__revert-btn')
        ?.click();

      expect(emitted).toEqual(payment);
    });

    it('shows a spinner label and disables the button while revertingId matches the row', () => {
      setup(buildExpenseDetail({ payments: [buildPayment({ id: 'p1' })] }));
      fixture.componentRef.setInput('revertingId', 'p1');
      fixture.detectChanges();

      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.vps__revert-btn',
      );
      expect(button?.disabled).toBe(true);
      expect(button?.textContent).toContain('Reverting...');
    });

    it('does not disable a different row while another row is reverting', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1' }), buildPayment({ id: 'p2' })],
        }),
      );
      fixture.componentRef.setInput('revertingId', 'p1');
      fixture.detectChanges();

      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.vps__revert-btn',
      );
      expect(buttons[0].disabled).toBe(true);
      expect(buttons[1].disabled).toBe(false);
    });

    it('renders revertError with role="alert" when set', () => {
      setup(buildExpenseDetail({ payments: [buildPayment()] }));
      fixture.componentRef.setInput(
        'revertError',
        'Shared payments are reverted from the Share screen.',
      );
      fixture.detectChanges();

      const alert = (fixture.nativeElement as HTMLElement).querySelector('.ew-alert[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain(
        'Shared payments are reverted from the Share screen.',
      );
    });

    it('renders no alert when revertError is null', () => {
      setup(buildExpenseDetail({ payments: [buildPayment()] }));

      const alert = (fixture.nativeElement as HTMLElement).querySelector('.ew-alert[role="alert"]');
      expect(alert).toBeNull();
    });
  });

  describe('reverted pair rendering — one row per economic event', () => {
    // Real confirmed repro: expense 26973c22-... ("DL *UberRides", R$30.96). Two legitimate,
    // non-duplicated trace lines that previously rendered as sibling rows of equal weight.
    const ORIGINAL_ID = '5c6a38c5-e062-4a43-9faa-ffb30c5a0360';
    const REVERSAL_ID = '6cdc9e14-1988-42e0-9583-72fff4366abb';

    function reproTrace(): OmegaViewerPayment[] {
      return [
        buildPayment({
          id: ORIGINAL_ID,
          amount: 30.96,
          paymentDate: '2026-09-08T12:00:00.000Z',
          reversal: false,
          reversed: true,
        }),
        buildPayment({
          id: REVERSAL_ID,
          amount: 30.96,
          paymentDate: '2026-09-09T12:00:00.000Z',
          reversal: true,
          reversed: false,
          reversedPaymentId: ORIGINAL_ID,
        }),
      ];
    }

    it('renders a reverted pair as ONE top-level row, not two', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('.vps__row').length).toBe(1);
    });

    it('nests the reversal inside its original row, not as a sibling li', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      const row = root.querySelector('.vps__row');
      const nested = root.querySelector('[data-testid="payment-nested-reversal"]');
      expect(nested).not.toBeNull();
      // DOM containment gives reading ORDER only. The programmatic association is asserted
      // separately below — the two are different guarantees.
      expect(row?.contains(nested as Node)).toBe(true);
    });

    it('binds the original amount to the reversal label via aria-describedby', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      const describedBy = root.querySelector('.vps__amount')?.getAttribute('aria-describedby');
      expect(describedBy).toBe(`reversal-${REVERSAL_ID}`);

      // The referenced id must actually resolve to the label element, otherwise the
      // association is dangling and announces nothing. Looked up by id rather than a CSS
      // selector: the ids are UUID-shaped, and `CSS.escape` is not available in this env.
      const target = Array.from(root.querySelectorAll('[id]')).find(
        (el) => el.id === describedBy,
      );
      expect(target).toBeDefined();
      expect(target?.textContent).toContain('Revertido em 09/09/2026');
    });

    it('groups a paired row so the original and its reversal announce as one unit', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const row = (fixture.nativeElement as HTMLElement).querySelector('.vps__row');
      expect(row?.getAttribute('role')).toBe('group');
      expect(row?.getAttribute('aria-label')).toBe('Pagamento de 08/09/2026, revertido');
    });

    it('gives the nested amount a self-describing accessible name, not a bare number', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const amount = (fixture.nativeElement as HTMLElement).querySelector('.vps__reversal-amount');
      // Built via `formatBrl` rather than a literal: Intl emits a non-breaking space after
      // "R$", so a hand-typed expectation looks identical but never matches.
      expect(amount?.getAttribute('aria-label')).toBe(
        `Estorno de ${formatBrl(30.96)} em 09/09/2026`,
      );
    });

    it('adds no group role to an unpaired row — a lone payment needs no grouping', () => {
      setup(buildExpenseDetail({ payments: [buildPayment({ id: 'p1' })] }));

      const row = (fixture.nativeElement as HTMLElement).querySelector('.vps__row');
      expect(row?.getAttribute('role')).toBeNull();
      expect(row?.getAttribute('aria-label')).toBeNull();
    });

    it('strikes through a reverted amount even in the unpaired fallback', () => {
      // Keyed on status, not on pairing: in the fallback a reverted payment still gets the
      // pill, so it must still get the strikethrough.
      setup(
        buildExpenseDetail({
          payments: [
            buildPayment({ id: ORIGINAL_ID, reversed: true }),
            buildPayment({ id: REVERSAL_ID, reversal: true, reversedPaymentId: null }),
          ],
        }),
      );

      const amounts = (fixture.nativeElement as HTMLElement).querySelectorAll('.vps__amount');
      expect(amounts[0].classList.contains('vps__amount--reversed')).toBe(true);
    });

    it('states the reverted date in words on the nested line, not by styling alone', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="payment-nested-reversal"]')?.textContent).toContain(
        'Revertido em 09/09/2026',
      );
    });

    it('keeps the Revertido pill on the paired row and drops the standalone Reversão pill', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="payment-status-reversed"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="payment-status-reversal"]')).toBeNull();
    });

    it('keeps the ew-blur privacy class on the nested reversal amount', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      const amount = root.querySelector('.vps__reversal-amount');
      expect(amount?.classList.contains('ew-blur')).toBe(true);
    });

    it('offers no revert action on a paired row — it is already reverted', () => {
      setup(buildExpenseDetail({ payments: reproTrace() }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vps__revert-btn')).toBeNull();
      expect(
        root.querySelector('[data-testid="payment-ineligible-hint"]')?.getAttribute('title'),
      ).toContain('já foi revertido');
    });

    it('regression: a trace with no reversals renders exactly as before, one row each', () => {
      setup(
        buildExpenseDetail({
          payments: [buildPayment({ id: 'p1' }), buildPayment({ id: 'p2' })],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('.vps__row').length).toBe(2);
      expect(root.querySelector('[data-testid="payment-nested-reversal"]')).toBeNull();
      expect(root.querySelectorAll('.vps__revert-btn').length).toBe(2);
    });

    it('falls back to flat sibling rows when the backend omits reversedPaymentId', () => {
      setup(
        buildExpenseDetail({
          payments: [
            buildPayment({ id: ORIGINAL_ID, reversed: true }),
            buildPayment({ id: REVERSAL_ID, reversal: true, reversedPaymentId: null }),
          ],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('.vps__row').length).toBe(2);
      expect(root.querySelector('[data-testid="payment-status-reversal"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="payment-status-reversed"]')).not.toBeNull();
    });

    it('still shows an orphan reversal rather than dropping it', () => {
      setup(
        buildExpenseDetail({
          payments: [
            buildPayment({
              id: REVERSAL_ID,
              reversal: true,
              reversedPaymentId: 'original-outside-this-trace',
            }),
          ],
        }),
      );

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('.vps__row').length).toBe(1);
      expect(root.querySelector('[data-testid="payment-status-reversal"]')).not.toBeNull();
    });
  });
});
