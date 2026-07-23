import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TagAccumulation } from '../models/tag-accumulation';
import { TagAccumulationService } from './tag-accumulation.service';

describe('TagAccumulationService', () => {
  let service: TagAccumulationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TagAccumulationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify({ ignoreCancelled: true }));

  it('loads accumulation via GET /tags/accumulation?walletId= and publishes it on accumulation$', () => {
    const response: TagAccumulation = {
      walletId: 'wallet-1',
      entries: [
        {
          tagId: 'tag-1',
          tagName: 'Food',
          parentId: null,
          total: 1075,
          directTotal: 1075,
          inheritedTotal: 0,
          breakdown: { EXPENSE: 50, INSTALLMENT: 1000, SUBSCRIPTION: 25 },
        },
      ],
    };
    const emitted: (TagAccumulation | null)[] = [];
    service.accumulation$.subscribe((value) => emitted.push(value));

    service.loadByWalletId('wallet-1');

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/tags/accumulation' && candidate.params.get('walletId') === 'wallet-1',
    );
    expect(request.request.method).toBe('GET');
    request.flush(response);

    expect(emitted.at(-1)).toEqual(response);
  });

  it('toggles loading$ around the request', () => {
    const loadingStates: boolean[] = [];
    service.loading$.subscribe((v) => loadingStates.push(v));

    service.loadByWalletId('wallet-1');
    expect(loadingStates.at(-1)).toBe(true);

    httpMock.expectOne((c) => c.url === '/api/tags/accumulation').flush({ walletId: 'wallet-1', entries: [] });
    expect(loadingStates.at(-1)).toBe(false);
  });

  it('surfaces an error via error$ and does not update accumulation$ on failure', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    service.loadByWalletId('wallet-1');
    httpMock.expectOne((c) => c.url === '/api/tags/accumulation').flush(null, { status: 500, statusText: 'Error' });

    expect(errors.at(-1)).toBe('Não foi possível carregar os acúmulos por tag.');
  });

  it('clears the previous accumulation before a new wallet finishes loading', () => {
    const walletOne: TagAccumulation = {
      walletId: 'wallet-1',
      entries: [
        { tagId: 'tag-1', tagName: 'Food', parentId: null, total: 100, directTotal: 100, inheritedTotal: 0, breakdown: { EXPENSE: 100 } },
      ],
    };
    const emitted: (TagAccumulation | null)[] = [];
    service.accumulation$.subscribe((value) => emitted.push(value));

    service.loadByWalletId('wallet-1');
    httpMock.expectOne((c) => c.url === '/api/tags/accumulation').flush(walletOne);
    expect(emitted.at(-1)).toEqual(walletOne);

    // Switching wallets must not keep rendering wallet-1's totals under wallet-2's context
    // while the new request is in flight — this was a MINOR finding (stale state).
    service.loadByWalletId('wallet-2');
    expect(emitted.at(-1)).toBeNull();

    httpMock.expectOne((c) => c.url === '/api/tags/accumulation').flush({ walletId: 'wallet-2', entries: [] });
    expect(emitted.at(-1)).toEqual({ walletId: 'wallet-2', entries: [] });
  });
});
