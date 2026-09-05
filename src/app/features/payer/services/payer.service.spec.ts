import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Payer } from '../models/payer';
import { PayerService } from './payer.service';

function makePayer(overrides: Partial<Payer> = {}): Payer {
  return {
    id: 'payer-1',
    name: 'Alice',
    type: 'STANDING',
    walletId: 'wallet-1',
    subscriptionId: null,
    paymentDate: '2026-05-01',
    amountDue: 100,
    activeShareAmount: 100,
    currency: 'BRL',
    deleted: false,
    ...overrides,
  };
}

describe('PayerService', () => {
  let service: PayerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PayerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('clears payers and skips the request when walletId is null', () => {
    const emitted: (readonly Payer[])[] = [];
    service.payers$.subscribe((v) => emitted.push(v));

    service.loadByWalletId(null);

    httpMock.expectNone(() => true);
    expect(emitted.at(-1)).toEqual([]);
  });

  it('loads payers for a wallet', () => {
    const payers = [makePayer()];
    const emitted: (readonly Payer[])[] = [];
    service.payers$.subscribe((v) => emitted.push(v));

    service.loadByWalletId('wallet-1');

    const req = httpMock.expectOne('/api/wallets/wallet-1/payers');
    expect(req.request.method).toBe('GET');
    req.flush(payers);

    expect(emitted.at(-1)).toEqual(payers);
  });

  // Regression (2026-09-05, Victor's report — "Total Due ainda está aparecendo
  // o último total due e não baseando-se no mês"): a fast wallet ("month")
  // switch used to let the OLD wallet's in-flight GET resolve after the NEW
  // wallet's, silently overwriting payers$ with the wrong month's data.
  it('cancels a stale in-flight request when the wallet changes before it resolves', () => {
    const emitted: (readonly Payer[])[] = [];
    service.payers$.subscribe((v) => emitted.push(v));

    service.loadByWalletId('wallet-old');
    service.loadByWalletId('wallet-new');

    // switchMap unsubscribes from wallet-old's request the instant wallet-new
    // is requested — its HTTP call is marked cancelled and can no longer
    // update payers$, even if a late/misordered response were to arrive.
    const reqOld = httpMock.expectOne('/api/wallets/wallet-old/payers');
    expect(reqOld.cancelled).toBe(true);
    const reqNew = httpMock.expectOne('/api/wallets/wallet-new/payers');

    reqNew.flush([makePayer({ id: 'payer-new', amountDue: 250 })]);

    expect(emitted.at(-1)).toEqual([makePayer({ id: 'payer-new', amountDue: 250 })]);
  });

  it('sets error$ when loading fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/wallets/wallet-1/payers').flush(null, { status: 500, statusText: 'Error' });

    expect(errors.at(-1)).toBe('Não foi possível carregar os payers.');
  });

  it('appends a created payer to payers$', () => {
    const existing = makePayer({ id: 'payer-1' });
    const created = makePayer({ id: 'payer-2', name: 'Bob' });
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/wallets/wallet-1/payers').flush([existing]);

    let result: Payer | undefined;
    service.save({ name: 'Bob', type: 'STANDING', paymentDate: '2026-05-01' }).subscribe((p) => (result = p));

    const req = httpMock.expectOne('/api/payers');
    expect(req.request.method).toBe('POST');
    req.flush(created);

    expect(result).toEqual(created);
  });

  it('replaces the patched payer in payers$', () => {
    const original = makePayer({ id: 'payer-1', name: 'Alice' });
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/wallets/wallet-1/payers').flush([original]);

    const updated = makePayer({ id: 'payer-1', name: 'Alicia' });
    const emitted: (readonly Payer[])[] = [];
    service.payers$.subscribe((v) => emitted.push(v));

    service.patch('payer-1', { name: 'Alicia' }).subscribe();
    httpMock.expectOne('/api/payers/payer-1').flush(updated);

    expect(emitted.at(-1)).toEqual([updated]);
  });

  it('removes a deleted payer from payers$', () => {
    const a = makePayer({ id: 'payer-1' });
    const b = makePayer({ id: 'payer-2' });
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/wallets/wallet-1/payers').flush([a, b]);

    const emitted: (readonly Payer[])[] = [];
    service.payers$.subscribe((v) => emitted.push(v));

    service.delete('payer-1').subscribe();
    const req = httpMock.expectOne('/api/payers/payer-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(emitted.at(-1)).toEqual([b]);
  });

  it('propagates a delete error and resets deleting$', () => {
    const deletingStates: (string | null)[] = [];
    service.deleting$.subscribe((v) => deletingStates.push(v));

    let errored = false;
    service.delete('payer-1').subscribe({ error: () => (errored = true) });
    httpMock.expectOne('/api/payers/payer-1').flush(null, { status: 500, statusText: 'Error' });

    expect(errored).toBe(true);
    expect(deletingStates.at(-1)).toBeNull();
  });
});
