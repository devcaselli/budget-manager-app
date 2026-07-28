import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { InstallmentFilter, InstallmentService } from './installment.service';

describe('InstallmentService.exportByWalletId', () => {
  let service: InstallmentService;
  let httpMock: HttpTestingController;

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

  it('GETs /export with sort param and blob response type', () => {
    const filter: Pick<InstallmentFilter, 'creditCardId' | 'sort'> = {
      creditCardId: null,
      sort: 'ENDING_LATE',
    };
    const blob = new Blob(['csv-content'], { type: 'text/csv' });

    service.exportByWalletId('wallet-1', filter).subscribe((res) => expect(res).toBe(blob));

    const request = httpMock.expectOne(
      (r) => r.url === '/api/installments/wallet/wallet-1/export',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('sort')).toBe('ENDING_LATE');
    expect(request.request.params.has('creditCardId')).toBe(false);
    expect(request.request.responseType).toBe('blob');
    request.flush(blob);
  });

  it('includes creditCardId param when set', () => {
    const filter: Pick<InstallmentFilter, 'creditCardId' | 'sort'> = {
      creditCardId: 'cc-9',
      sort: 'ENDING_SOON',
    };

    service.exportByWalletId('wallet-1', filter).subscribe();

    const request = httpMock.expectOne(
      (r) => r.url === '/api/installments/wallet/wallet-1/export',
    );
    expect(request.request.params.get('creditCardId')).toBe('cc-9');
    request.flush(new Blob());
  });
});
