import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CreateExtraBudgetRequest, ExtraBudget } from '../models/extra-budget';
import { ExtraBudgetService } from './extra-budget.service';

describe('ExtraBudgetService', () => {
  let service: ExtraBudgetService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ExtraBudgetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('should return extra budgets by wallet id via GET /api/extra-budgets/wallet/:walletId', () => {
    const extraBudgets: ExtraBudget[] = [extraBudgetFixture()];

    service.findByWalletId('wallet-1').subscribe((result) => expect(result).toEqual(extraBudgets));

    const request = httpMock.expectOne('/api/extra-budgets/wallet/wallet-1');
    expect(request.request.method).toBe('GET');
    request.flush(extraBudgets);
  });

  it('should create an extra budget and prepend it to extraBudgets$', () => {
    const input: CreateExtraBudgetRequest = {
      description: 'Bonus',
      walletId: 'wallet-1',
      amount: 300,
      allocations: [{ bulletId: 'bullet-1', amount: 300 }],
    };
    const extraBudget = extraBudgetFixture(input);
    const emittedExtraBudgets: (readonly ExtraBudget[])[] = [];

    service.extraBudgets$.subscribe((value) => emittedExtraBudgets.push(value));
    service.create(input).subscribe((result) => expect(result).toEqual(extraBudget));

    const request = httpMock.expectOne('/api/extra-budgets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(extraBudget);

    expect(emittedExtraBudgets.at(-1)).toEqual([extraBudget]);
  });

  it('should delete an extra budget and remove it from extraBudgets$', () => {
    const extraBudget = extraBudgetFixture();
    const emittedExtraBudgets: (readonly ExtraBudget[])[] = [];

    service.extraBudgets$.subscribe((value) => emittedExtraBudgets.push(value));
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/extra-budgets/wallet/wallet-1').flush([extraBudget]);

    service.delete(extraBudget.id).subscribe();

    const request = httpMock.expectOne('/api/extra-budgets/extra-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    expect(emittedExtraBudgets.at(-1)).toEqual([]);
  });
});

function extraBudgetFixture(
  overrides: Partial<CreateExtraBudgetRequest> = {},
): ExtraBudget {
  return {
    id: 'extra-1',
    description: overrides.description ?? 'Bonus',
    walletId: overrides.walletId ?? 'wallet-1',
    amount: overrides.amount ?? 300,
    currency: 'BRL',
    allocations: overrides.allocations ?? [{ bulletId: 'bullet-1', amount: 300 }],
    deleted: false,
    deletedAt: null,
  };
}
