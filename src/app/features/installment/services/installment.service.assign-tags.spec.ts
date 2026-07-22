import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Installment } from '../models/installment';
import { InstallmentService } from './installment.service';

function makeInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'inst-1',
    description: 'Notebook',
    details: null,
    originalValue: 100,
    installmentValue: 100,
    currency: 'BRL',
    installmentNumber: 10,
    purchaseDate: '2026-01-01',
    lastInstallmentDate: '2026-10',
    creditCardId: 'card-1',
    sourceWalletId: 'wallet-1',
    sourceEffectiveMonth: '2026-01',
    shared: false,
    ownerRatio: null,
    effectiveOriginalValue: 100,
    effectiveInstallmentValue: 100,
    tagIds: [],
    ...overrides,
  };
}

describe('InstallmentService.assignTags', () => {
  let service: InstallmentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InstallmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify({ ignoreCancelled: true }));

  it('PATCHes /installments/{id} with only the tagIds field', () => {
    let result: Installment | undefined;
    service.assignTags('inst-1', ['tag-1', 'tag-2']).subscribe((updated) => (result = updated));

    const req = httpMock.expectOne('/api/installments/inst-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ tagIds: ['tag-1', 'tag-2'] });

    const updated = makeInstallment({ tagIds: ['tag-1', 'tag-2'] });
    req.flush(updated);

    expect(result).toEqual(updated);
  });

  it('sends an empty array to clear all tags', () => {
    service.assignTags('inst-1', []).subscribe();

    const req = httpMock.expectOne('/api/installments/inst-1');
    expect(req.request.body).toEqual({ tagIds: [] });
    req.flush(makeInstallment({ tagIds: [] }));
  });

  it('propagates an error and surfaces it via error$', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    let errored = false;
    service.assignTags('inst-1', ['tag-1']).subscribe({ error: () => (errored = true) });

    httpMock.expectOne('/api/installments/inst-1').flush(null, { status: 500, statusText: 'Error' });

    expect(errored).toBe(true);
    expect(errors.at(-1)).toBe('Unable to update the installment.');
  });
});
