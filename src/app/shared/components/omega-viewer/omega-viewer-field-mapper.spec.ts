import { OmegaViewerExpenseDetail } from './models/omega-viewer-detail';
import { mapDetailToFieldRows, mapRemainingBadge, OmegaViewerFieldMapperContext } from './omega-viewer-field-mapper';

const emptyCtx: OmegaViewerFieldMapperContext = {
  tagNameById: new Map(),
  creditCardNameById: new Map(),
};

function buildExpenseDetail(overrides: Partial<OmegaViewerExpenseDetail> = {}): OmegaViewerExpenseDetail {
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

describe('mapDetailToFieldRows — EXPENSE', () => {
  it('resolves credit card and tag names via the provided lookup maps', () => {
    const ctx: OmegaViewerFieldMapperContext = {
      tagNameById: new Map([['tag-1', 'Groceries']]),
      creditCardNameById: new Map([['card-1', 'Nubank']]),
    };

    const rows = mapDetailToFieldRows(buildExpenseDetail({ tagIds: ['tag-1'] }), ctx);

    expect(rows.find((r) => r.key === 'creditCard')?.value).toBe('Nubank');
    expect(rows.find((r) => r.key === 'tags')?.value).toBe('Groceries');
  });

  it('falls back to an em-dash placeholder for an unresolved tag id, never a raw uuid', () => {
    const rows = mapDetailToFieldRows(buildExpenseDetail({ tagIds: ['unknown-id'] }), emptyCtx);

    expect(rows.find((r) => r.key === 'tags')?.value).toBe('—');
  });

  it('marks monetary fields (cost, remaining) as sensitive for .ew-blur', () => {
    const rows = mapDetailToFieldRows(buildExpenseDetail(), emptyCtx);

    expect(rows.find((r) => r.key === 'cost')?.sensitive).toBe(true);
    expect(rows.find((r) => r.key === 'remaining')?.sensitive).toBe(true);
    expect(rows.find((r) => r.key === 'status')?.sensitive).toBe(false);
  });

  it('derives status PAID when remaining <= 0, OPEN otherwise', () => {
    expect(mapDetailToFieldRows(buildExpenseDetail({ remaining: 0 }), emptyCtx).find((r) => r.key === 'status')?.value).toBe('PAID');
    expect(mapDetailToFieldRows(buildExpenseDetail({ remaining: 10 }), emptyCtx).find((r) => r.key === 'status')?.value).toBe('OPEN');
  });
});

describe('mapRemainingBadge', () => {
  it('returns {kind: "none"} for a non-EXPENSE detail kind', () => {
    const detail = buildExpenseDetail({ installmentsRemaining: 3 });
    expect(mapRemainingBadge({ ...detail, kind: 'EXPENSE' })).toEqual({ kind: 'remaining', count: 3 });
  });

  it('returns {kind: "none"} when installmentsRemaining is null (not installment-linked)', () => {
    const detail = buildExpenseDetail({ installmentsRemaining: null });
    expect(mapRemainingBadge(detail)).toEqual({ kind: 'none' });
  });

  it('returns {kind: "remaining", count: 0} when installmentsRemaining is 0 (fully paid) — NOT "none"', () => {
    const detail = buildExpenseDetail({ installmentsRemaining: 0 });
    const badge = mapRemainingBadge(detail);

    expect(badge).toEqual({ kind: 'remaining', count: 0 });
    expect(badge.kind).not.toBe('none');
  });

  it('returns {kind: "remaining", count: N} for a positive remaining count', () => {
    const detail = buildExpenseDetail({ installmentsRemaining: 5 });
    expect(mapRemainingBadge(detail)).toEqual({ kind: 'remaining', count: 5 });
  });
});
