import { OmegaViewerPayment } from './omega-viewer-detail';
import { pairPaymentTrace } from './omega-viewer-payment-row';

/**
 * Fixtures use the REAL confirmed repro from the production report: expense
 * `26973c22-0015-4510-8427-eda252355768` ("DL *UberRides", R$30.96) in the September wallet,
 * whose trace legitimately carries two lines — the original (`reversed: true`) and its
 * reversal (`reversal: true`) — of the same amount. No data is duplicated; the defect was
 * that both rendered as sibling rows of equal weight.
 */
const ORIGINAL_ID = '5c6a38c5-e062-4a43-9faa-ffb30c5a0360';
const REVERSAL_ID = '6cdc9e14-1988-42e0-9583-72fff4366abb';

function buildPayment(overrides: Partial<OmegaViewerPayment> = {}): OmegaViewerPayment {
  return {
    id: ORIGINAL_ID,
    amount: 30.96,
    paymentDate: '2026-09-08T12:00:00.000Z',
    bulletId: 'bullet-1',
    bulletDescription: 'Transporte',
    reversal: false,
    reversed: false,
    reversedPaymentId: null,
    payerIds: ['payer-1'],
    kind: 'NORMAL',
    ...overrides,
  };
}

/** The original of the confirmed repro: paid, then reverted. */
function buildReproOriginal(): OmegaViewerPayment {
  return buildPayment({ id: ORIGINAL_ID, reversal: false, reversed: true });
}

/** The reversal of the confirmed repro, pointing back at the original. */
function buildReproReversal(): OmegaViewerPayment {
  return buildPayment({
    id: REVERSAL_ID,
    paymentDate: '2026-09-09T12:00:00.000Z',
    reversal: true,
    reversed: false,
    reversedPaymentId: ORIGINAL_ID,
  });
}

describe('pairPaymentTrace', () => {
  it('returns no rows for an empty trace', () => {
    expect(pairPaymentTrace([])).toEqual([]);
  });

  it('collapses an original + its reversal into ONE row with the reversal attached', () => {
    const rows = pairPaymentTrace([buildReproOriginal(), buildReproReversal()]);

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(ORIGINAL_ID);
    expect(rows[0].status).toBe('reversed');
    expect(rows[0].reversal?.id).toBe(REVERSAL_ID);
  });

  it('never emits a paired reversal as its own top-level row', () => {
    const rows = pairPaymentTrace([buildReproOriginal(), buildReproReversal()]);

    expect(rows.some((row) => row.id === REVERSAL_ID)).toBe(false);
  });

  it('labels the nested reversal with its own date, not the original payment date', () => {
    const rows = pairPaymentTrace([buildReproOriginal(), buildReproReversal()]);

    expect(rows[0].reversal?.label).toBe('Revertido em 09/09/2026');
    expect(rows[0].dateLabel).toBe('08/09/2026');
  });

  it('pairs regardless of trace ordering, when the reversal arrives before its original', () => {
    const rows = pairPaymentTrace([buildReproReversal(), buildReproOriginal()]);

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(ORIGINAL_ID);
    expect(rows[0].reversal?.id).toBe(REVERSAL_ID);
  });

  it('emits an unreverted payment as one plain row with no nested reversal', () => {
    const rows = pairPaymentTrace([buildPayment({ id: 'p1' })]);

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('p1');
    expect(rows[0].status).toBe('normal');
    expect(rows[0].reversal).toBeNull();
    expect(rows[0].revertable).toBe(true);
  });

  it('emits an ORPHAN reversal (its original is outside the trace) as a standalone row', () => {
    const rows = pairPaymentTrace([
      buildPayment({
        id: REVERSAL_ID,
        reversal: true,
        reversedPaymentId: 'original-not-in-this-trace',
      }),
    ]);

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(REVERSAL_ID);
    expect(rows[0].status).toBe('reversal');
    expect(rows[0].reversal).toBeNull();
  });

  it('keeps every line when the backend has not rolled out reversedPaymentId yet', () => {
    // Both lines look exactly like the current production payload: reversal flags set, but no
    // deterministic link. Falling back to flat rendering is correct — pairing by amount/date
    // would risk a WRONG pairing, which misstates the ledger.
    const rows = pairPaymentTrace([
      buildReproOriginal(),
      buildPayment({ id: REVERSAL_ID, reversal: true, reversedPaymentId: null }),
    ]);

    expect(rows.length).toBe(2);
    expect(rows.map((row) => row.id)).toEqual([ORIGINAL_ID, REVERSAL_ID]);
    expect(rows[0].reversal).toBeNull();
  });

  it('pairs each cycle independently across several pay/revert cycles', () => {
    const rows = pairPaymentTrace([
      buildPayment({ id: 'orig-a', reversed: true }),
      buildPayment({ id: 'rev-a', reversal: true, reversedPaymentId: 'orig-a' }),
      buildPayment({ id: 'orig-b', reversed: true }),
      buildPayment({ id: 'rev-b', reversal: true, reversedPaymentId: 'orig-b' }),
      buildPayment({ id: 'orig-c' }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(['orig-a', 'orig-b', 'orig-c']);
    expect(rows[0].reversal?.id).toBe('rev-a');
    expect(rows[1].reversal?.id).toBe('rev-b');
    expect(rows[2].reversal).toBeNull();
  });

  it('preserves the original trace order of the emitted rows', () => {
    const rows = pairPaymentTrace([
      buildPayment({ id: 'p1' }),
      buildPayment({ id: 'p2', reversed: true }),
      buildPayment({ id: 'rev-p2', reversal: true, reversedPaymentId: 'p2' }),
      buildPayment({ id: 'p3' }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('keeps a nested reversal out of the revert action — only originals stay revertable', () => {
    const rows = pairPaymentTrace([buildReproOriginal(), buildReproReversal()]);

    expect(rows[0].revertable).toBe(false);
    expect(rows[0].ineligibleHint).toBe('Este pagamento já foi revertido.');
  });
});

/**
 * Regression cover for three malformed shapes found by probing (code review, Criticals 1-3).
 * Each previously caused a payment line to render NOWHERE or in the wrong order.
 *
 * The load-bearing assertion is the structural invariant, not the case-by-case shape: every
 * input line must be reachable in the output tree, either as a top-level row or as some row's
 * nested reversal. Asserting the invariant rather than enumerating known-bad shapes is what
 * catches the NEXT drop by construction — the previous test suite was fully green while three
 * shapes silently dropped lines.
 */
describe('pairPaymentTrace — malformed traces: nothing is ever dropped', () => {
  /** Every id reachable in the rendered tree, top-level rows plus nested reversals. */
  function renderedIds(rows: readonly { id: string; reversal: { id: string } | null }[]): string[] {
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
      if (row.reversal !== null) {
        ids.push(row.reversal.id);
      }
    }
    return ids.sort();
  }

  function expectNothingDropped(trace: readonly OmegaViewerPayment[]): void {
    const rendered = renderedIds(pairPaymentTrace(trace));
    const expected = trace.map((payment) => payment.id).sort();
    expect(rendered).toEqual(expected);
  }

  it('renders a self-referencing reversal instead of nesting it under itself', () => {
    // Probe shape: id 'a' claiming to reverse 'a'. Previously produced ZERO rows.
    const trace = [buildPayment({ id: 'a', reversal: true, reversedPaymentId: 'a' })];

    const rows = pairPaymentTrace(trace);

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('a');
    expect(rows[0].reversal).toBeNull();
    expectNothingDropped(trace);
  });

  it('keeps both lines of a chained reversal (a reversal of a reversal) visible', () => {
    // Probe shape: orig -> r1 (reverses orig, itself reversed) -> r2 (reverses r1).
    // Previously produced ONE row, dropping r2 entirely.
    const trace = [
      buildPayment({ id: 'orig', reversed: true }),
      buildPayment({ id: 'r1', reversal: true, reversed: true, reversedPaymentId: 'orig' }),
      buildPayment({ id: 'r2', reversal: true, reversedPaymentId: 'r1' }),
    ];

    const rows = pairPaymentTrace(trace);

    // r1 is a reversal, so it is not a nestable target: r2 must stay top-level.
    expect(rows.some((row) => row.id === 'r2')).toBe(true);
    expectNothingDropped(trace);
  });

  it('keeps r2 top-level rather than nesting it into r1, which has no slot for a reversal', () => {
    const rows = pairPaymentTrace([
      buildPayment({ id: 'orig', reversed: true }),
      buildPayment({ id: 'r1', reversal: true, reversed: true, reversedPaymentId: 'orig' }),
      buildPayment({ id: 'r2', reversal: true, reversedPaymentId: 'r1' }),
    ]);

    // r1 legitimately nests under orig (a valid non-reversal target). r2 cannot nest under r1,
    // because an OmegaViewerPaymentReversalDetail has no slot of its own for a nested reversal
    // — so r2 must remain a top-level row instead of disappearing into it.
    expect(rows.find((row) => row.id === 'orig')?.reversal?.id).toBe('r1');
    const r2Row = rows.find((row) => row.id === 'r2');
    expect(r2Row).toBeDefined();
    expect(r2Row?.status).toBe('reversal');
    expect(r2Row?.reversal).toBeNull();
  });

  it('pairs the FIRST reversal when two claim the same original, keeping chronological order', () => {
    // Probe shape: r1 and r2 both claiming 'orig'. Previously nested r2 and surfaced r1 bare —
    // the user saw the first reversal loose and the second nested, backwards.
    const trace = [
      buildPayment({ id: 'orig', reversed: true }),
      buildPayment({ id: 'r1', reversal: true, reversedPaymentId: 'orig' }),
      buildPayment({ id: 'r2', reversal: true, reversedPaymentId: 'orig' }),
    ];

    const rows = pairPaymentTrace(trace);

    expect(rows.find((row) => row.id === 'orig')?.reversal?.id).toBe('r1');
    expect(rows.some((row) => row.id === 'r2')).toBe(true);
    expectNothingDropped(trace);
  });

  it('never drops a line across every malformed shape probed, including duplicate ids', () => {
    expectNothingDropped([buildPayment({ id: 'a', reversal: true, reversedPaymentId: 'a' })]);
    expectNothingDropped([
      buildPayment({ id: 'orig', reversed: true }),
      buildPayment({ id: 'r1', reversal: true, reversed: true, reversedPaymentId: 'orig' }),
      buildPayment({ id: 'r2', reversal: true, reversedPaymentId: 'r1' }),
    ]);
    expectNothingDropped([
      buildPayment({ id: 'orig', reversed: true }),
      buildPayment({ id: 'r1', reversal: true, reversedPaymentId: 'orig' }),
      buildPayment({ id: 'r2', reversal: true, reversedPaymentId: 'orig' }),
    ]);
    // Reversal pointing at an id that is not in the trace at all.
    expectNothingDropped([
      buildPayment({ id: 'r1', reversal: true, reversedPaymentId: 'nowhere' }),
    ]);
    // Backend shipped nothing: every reversal unpairable.
    expectNothingDropped([
      buildPayment({ id: 'orig', reversed: true }),
      buildPayment({ id: 'r1', reversal: true, reversedPaymentId: null }),
    ]);
  });

  it('still pairs the well-formed repro shape after all the malformed guards', () => {
    const trace = [buildReproOriginal(), buildReproReversal()];

    const rows = pairPaymentTrace(trace);

    expect(rows.length).toBe(1);
    expect(rows[0].reversal?.id).toBe(REVERSAL_ID);
    expectNothingDropped(trace);
  });
});
