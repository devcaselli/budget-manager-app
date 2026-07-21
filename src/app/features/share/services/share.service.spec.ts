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
