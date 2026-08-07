import { OmegaViewerPayment } from '../components/omega-viewer/models/omega-viewer-detail';
import { isRevertablePayment } from './is-revertable-payment';

function buildPayment(overrides: Partial<OmegaViewerPayment> = {}): OmegaViewerPayment {
  return {
    id: 'payment-1',
    amount: 120,
    paymentDate: '2026-04-29T12:00:00.000Z',
    bulletId: 'bullet-1',
    bulletDescription: 'Mercado',
    reversal: false,
    reversed: false,
    payerIds: ['payer-1'],
    kind: 'NORMAL',
    ...overrides,
  };
}

describe('isRevertablePayment', () => {
  it('is revertable when NORMAL, neither a reversal nor already reversed', () => {
    expect(
      isRevertablePayment(buildPayment({ kind: 'NORMAL', reversal: false, reversed: false })),
    ).toBe(true);
  });

  it('is NOT revertable when the payment itself is a reversal', () => {
    expect(isRevertablePayment(buildPayment({ reversal: true, reversed: false }))).toBe(false);
  });

  it('is NOT revertable when the payment was already reverted', () => {
    expect(isRevertablePayment(buildPayment({ reversal: false, reversed: true }))).toBe(false);
  });

  it('is NOT revertable when both reversal and reversed are true', () => {
    expect(isRevertablePayment(buildPayment({ reversal: true, reversed: true }))).toBe(false);
  });

  it('is NOT revertable when kind is SHARED, even if neither reversal nor reversed', () => {
    expect(
      isRevertablePayment(buildPayment({ kind: 'SHARED', reversal: false, reversed: false })),
    ).toBe(false);
  });

  it('does not depend on payerIds count directly — SHARED is now detected via kind, not payerIds', () => {
    const single = buildPayment({ kind: 'NORMAL', payerIds: ['payer-1'] });
    const multi = buildPayment({ kind: 'NORMAL', payerIds: ['payer-1', 'payer-2'] });
    expect(isRevertablePayment(single)).toBe(isRevertablePayment(multi));
  });
});
