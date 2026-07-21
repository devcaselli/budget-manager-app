import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PagedInstallmentResponse } from '../models/installment';
import { InstallmentFilter, InstallmentService } from './installment.service';

describe('InstallmentService.loadFinished', () => {
  let service: InstallmentService;
  let httpMock: HttpTestingController;

  const emptyPage: PagedInstallmentResponse = {
    content: [],
    page: 0,
    size: 7,
    totalElements: 0,
    totalPages: 0,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(InstallmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('GETs /finished with page, size and sort params', () => {
    const filter: InstallmentFilter = {
      creditCardId: null,
      sort: 'ENDING_LATE',
      page: 1,
      size: 7,
    };

    service.loadFinished('wallet-1', filter).subscribe((res) => expect(res).toEqual(emptyPage));

    const request = httpMock.expectOne(
      (r) => r.url === '/api/installments/wallet/wallet-1/finished',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('7');
    expect(request.request.params.get('sort')).toBe('ENDING_LATE');
    expect(request.request.params.has('creditCardId')).toBe(false);
    request.flush(emptyPage);
  });

  it('includes creditCardId param when set', () => {
    const filter: InstallmentFilter = {
      creditCardId: 'cc-9',
      sort: 'ENDING_SOON',
      page: 0,
      size: 7,
    };

    service.loadFinished('wallet-1', filter).subscribe();

    const request = httpMock.expectOne(
      (r) => r.url === '/api/installments/wallet/wallet-1/finished',
    );
    expect(request.request.params.get('creditCardId')).toBe('cc-9');
    request.flush(emptyPage);
  });

  it('does not touch the active installments$ stream', () => {
    const emissions: number[] = [];
    service.installments$.subscribe((v) => emissions.push(v.length));

    service.loadFinished('wallet-1', {
      creditCardId: null,
      sort: 'ENDING_LATE',
      page: 0,
      size: 7,
    }).subscribe();

    httpMock
      .expectOne((r) => r.url === '/api/installments/wallet/wallet-1/finished')
      .flush({ ...emptyPage, content: [], totalElements: 3 });

    // Only the initial empty emission — loadFinished must not mutate installments$.
    expect(emissions).toEqual([0]);
  });
});
