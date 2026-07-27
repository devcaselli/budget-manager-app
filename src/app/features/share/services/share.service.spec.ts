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
    sourceName: 'Netflix',
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

  describe('loadAll', () => {
    it('should fetch all owner shares via GET /api/shares and populate shares$', () => {
      const shares = [buildShare(), buildShare({ id: 'share-2', walletId: 'wallet-2' })];
      const emitted: (readonly Share[])[] = [];
      service.shares$.subscribe((value) => emitted.push(value));

      service.loadAll();

      const request = httpMock.expectOne('/api/shares');
      expect(request.request.method).toBe('GET');
      request.flush(shares);

      expect(emitted.at(-1)).toEqual(shares);
    });

    it('should toggle loading$ around the request', () => {
      const loadingStates: boolean[] = [];
      service.loading$.subscribe((value) => loadingStates.push(value));

      service.loadAll();
      expect(loadingStates).toEqual([false, true]);

      httpMock.expectOne('/api/shares').flush([]);
      expect(loadingStates).toEqual([false, true, false]);
    });

    it('should set error$ when the load fails', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.loadAll();
      httpMock
        .expectOne('/api/shares')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(errors.at(-1)).toBe('Não foi possível carregar os compartilhamentos.');
    });

    it('should populate shares$ with a null sourceName when the backend could not resolve it', () => {
      const shares = [buildShare({ sourceName: null })];
      const emitted: (readonly Share[])[] = [];
      service.shares$.subscribe((value) => emitted.push(value));

      service.loadAll();
      httpMock.expectOne('/api/shares').flush(shares);

      expect(emitted.at(-1)?.[0].sourceName).toBeNull();
    });
  });

  describe('loadByWalletId', () => {
    it('should fetch a wallet\'s shares via GET /api/wallets/:id/shares and populate walletShares$', () => {
      const shares = [buildShare({ sourceType: 'EXPENSE', sourceName: 'Groceries' })];
      const emitted: (readonly Share[])[] = [];
      service.walletShares$.subscribe((value) => emitted.push(value));

      service.loadByWalletId('wallet-1');

      const request = httpMock.expectOne('/api/wallets/wallet-1/shares');
      expect(request.request.method).toBe('GET');
      request.flush(shares);

      expect(emitted.at(-1)).toEqual(shares);
    });

    it('should emit an empty array and skip the HTTP call when walletId is null', () => {
      const emitted: (readonly Share[])[] = [];
      service.walletShares$.subscribe((value) => emitted.push(value));

      service.loadByWalletId(null);

      httpMock.expectNone(() => true);
      expect(emitted.at(-1)).toEqual([]);
    });

    it('should toggle walletSharesLoading$ around the request', () => {
      const loadingStates: boolean[] = [];
      service.walletSharesLoading$.subscribe((value) => loadingStates.push(value));

      service.loadByWalletId('wallet-1');
      expect(loadingStates).toEqual([false, true]);

      httpMock.expectOne('/api/wallets/wallet-1/shares').flush([]);
      expect(loadingStates).toEqual([false, true, false]);
    });

    it('should set walletSharesError$ when the load fails, without touching error$', () => {
      const walletErrors: (string | null)[] = [];
      const ownerErrors: (string | null)[] = [];
      service.walletSharesError$.subscribe((value) => walletErrors.push(value));
      service.error$.subscribe((value) => ownerErrors.push(value));

      service.loadByWalletId('wallet-1');
      httpMock
        .expectOne('/api/wallets/wallet-1/shares')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(walletErrors.at(-1)).toBe('Não foi possível carregar os compartilhamentos da carteira.');
      expect(ownerErrors.at(-1)).toBeNull();
    });

    it('should keep shares$ and walletShares$ independent — populating one does not alter the other', () => {
      const ownerShares = [buildShare({ id: 'owner-share' })];
      const walletShares = [buildShare({ id: 'wallet-share' })];

      service.loadAll();
      httpMock.expectOne('/api/shares').flush(ownerShares);

      service.loadByWalletId('wallet-1');
      httpMock.expectOne('/api/wallets/wallet-1/shares').flush(walletShares);

      let ownerEmitted: readonly Share[] | undefined;
      let walletEmitted: readonly Share[] | undefined;
      service.shares$.subscribe((v) => (ownerEmitted = v));
      service.walletShares$.subscribe((v) => (walletEmitted = v));

      expect(ownerEmitted).toEqual(ownerShares);
      expect(walletEmitted).toEqual(walletShares);
    });

    it('should not clear shares$ when a wallet-scoped load fails after shares$ was already populated', () => {
      const ownerShares = [buildShare({ id: 'owner-share' })];
      service.loadAll();
      httpMock.expectOne('/api/shares').flush(ownerShares);

      service.loadByWalletId('wallet-1');
      httpMock
        .expectOne('/api/wallets/wallet-1/shares')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      let ownerEmitted: readonly Share[] | undefined;
      service.shares$.subscribe((v) => (ownerEmitted = v));
      expect(ownerEmitted).toEqual(ownerShares);
    });
  });

  describe('create', () => {
    it('should POST to /api/shares and optimistically prepend the created share', () => {
      const emitted: (readonly Share[])[] = [];
      service.shares$.subscribe((value) => emitted.push(value));

      const created = buildShare({ id: 'share-new' });
      service.create({
        walletId: 'wallet-1',
        sourceType: 'EXPENSE',
        sourceId: 'expense-1',
        totalAmount: 100,
        currency: 'BRL',
        ownerShare: 70,
        quotas: [{ payerId: 'payer-1', amount: 30 }],
      }).subscribe();

      const request = httpMock.expectOne('/api/shares');
      expect(request.request.method).toBe('POST');
      request.flush(created);

      expect(emitted.at(-1)).toEqual([created]);
    });
  });

  describe('revert', () => {
    it('should POST to /api/shares/:id/revert and reload all shares', () => {
      service.revert('share-1').subscribe();

      const revertRequest = httpMock.expectOne('/api/shares/share-1/revert');
      expect(revertRequest.request.method).toBe('POST');
      expect(revertRequest.request.body).toBeNull();
      revertRequest.flush(null, { status: 204, statusText: 'No Content' });

      // Reload of the owner's shares is triggered after a successful revert.
      const reload = httpMock.expectOne('/api/shares');
      expect(reload.request.method).toBe('GET');
      reload.flush([]);
    });

    it('should set error$ when the revert fails', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.revert('share-1').subscribe({ error: () => undefined });

      httpMock
        .expectOne('/api/shares/share-1/revert')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(errors.at(-1)).toBe('Não foi possível reverter o compartilhamento.');
    });
  });
});
