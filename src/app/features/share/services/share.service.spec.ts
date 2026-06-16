import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Share } from '../models/share';
import { ShareService } from './share.service';

function buildShare(overrides: Partial<Share> = {}): Share {
  return {
    id: 'share-1',
    walletId: 'wallet-1',
    sourceType: 'SUBSCRIPTION',
    sourceId: 'sub-1',
    totalAmount: 100,
    ownerShare: 50,
    ownerRatio: 0.5,
    currency: 'BRL',
    status: 'ACTIVE',
    quotas: [],
    paymentIds: [],
    createdAt: '2026-06-01T10:00:00Z',
    revertedAt: null,
    stoppedFromMonth: null,
    ...overrides,
  };
}

describe('ShareService', () => {
  let service: ShareService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ShareService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('should emit an empty share array as the initial state', () => {
    let emitted: readonly Share[] | undefined;
    service.shares$.subscribe((shares) => (emitted = shares));

    expect(emitted).toEqual([]);
  });

  describe('loadByWalletId', () => {
    it('should fetch shares via GET /api/wallets/:id/shares and populate shares$', () => {
      const shares = [buildShare()];
      const emitted: (readonly Share[])[] = [];
      service.shares$.subscribe((value) => emitted.push(value));

      service.loadByWalletId('wallet-1');

      const request = httpMock.expectOne('/api/wallets/wallet-1/shares');
      expect(request.request.method).toBe('GET');
      request.flush(shares);

      expect(emitted.at(-1)).toEqual(shares);
    });

    it('should clear shares and skip the request when walletId is null', () => {
      service.loadByWalletId(null);

      httpMock.expectNone(() => true);
    });

    it('should toggle loading$ around the request', () => {
      const loadingStates: boolean[] = [];
      service.loading$.subscribe((value) => loadingStates.push(value));

      service.loadByWalletId('wallet-1');
      expect(loadingStates).toEqual([false, true]);

      httpMock.expectOne('/api/wallets/wallet-1/shares').flush([]);
      expect(loadingStates).toEqual([false, true, false]);
    });

    it('should set error$ when the load fails', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.loadByWalletId('wallet-1');
      httpMock
        .expectOne('/api/wallets/wallet-1/shares')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(errors.at(-1)).toBe('Não foi possível carregar os compartilhamentos.');
    });
  });

  describe('stop', () => {
    it('should POST to /api/wallets/:walletId/shares/:shareId/stop and reload the wallet', () => {
      service.loadByWalletId('wallet-1');
      httpMock.expectOne('/api/wallets/wallet-1/shares').flush([buildShare()]);

      service.stop('wallet-1', 'share-1').subscribe();

      const stopRequest = httpMock.expectOne('/api/wallets/wallet-1/shares/share-1/stop');
      expect(stopRequest.request.method).toBe('POST');
      expect(stopRequest.request.body).toBeNull();
      stopRequest.flush(null, { status: 204, statusText: 'No Content' });

      // Reload of the current wallet is triggered after a successful stop.
      const reload = httpMock.expectOne('/api/wallets/wallet-1/shares');
      expect(reload.request.method).toBe('GET');
      reload.flush([]);
    });

    it('should expose a friendly message when the share is not stoppable (409)', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.stop('wallet-1', 'share-1').subscribe({ error: () => undefined });

      httpMock
        .expectOne('/api/wallets/wallet-1/shares/share-1/stop')
        .flush({ message: 'not applicable' }, { status: 409, statusText: 'Conflict' });

      expect(errors.at(-1)).toBe(
        'Este compartilhamento nao pode ser interrompido (e despesa ou ja foi revertido).',
      );
    });

    it('should expose a generic message for non-409 failures', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.stop('wallet-1', 'share-1').subscribe({ error: () => undefined });

      httpMock
        .expectOne('/api/wallets/wallet-1/shares/share-1/stop')
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });

      expect(errors.at(-1)).toBe('Não foi possível interromper o compartilhamento.');
    });

    it('should toggle stopping$ with the share id during the request', () => {
      service.loadByWalletId('wallet-1');
      httpMock.expectOne('/api/wallets/wallet-1/shares').flush([buildShare()]);

      const stoppingStates: (string | null)[] = [];
      service.stopping$.subscribe((value) => stoppingStates.push(value));

      service.stop('wallet-1', 'share-1').subscribe();
      expect(stoppingStates).toEqual([null, 'share-1']);

      httpMock
        .expectOne('/api/wallets/wallet-1/shares/share-1/stop')
        .flush(null, { status: 204, statusText: 'No Content' });
      // Reload fired by the success path.
      httpMock.expectOne('/api/wallets/wallet-1/shares').flush([]);

      expect(stoppingStates.at(-1)).toBeNull();
    });
  });
});
