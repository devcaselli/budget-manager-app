import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CreateExpenseRequest, Expense, PagedExpenseResponse } from '../models/expense';
import { ExpenseService } from './expense.service';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ExpenseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('should return expenses by wallet id via GET /api/expenses/wallet/:walletId', () => {
    const response = pagedResponse([expense]);

    service.findByWalletId('wallet-1').subscribe((result) => expect(result).toEqual(response));

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/expenses/wallet/wallet-1' &&
        candidate.params.get('page') === '0' &&
        candidate.params.get('size') === '100',
    );
    expect(request.request.method).toBe('GET');
    request.flush(response);
  });

  it('should populate expenses$ with loadByWalletId API response', () => {
    const emittedExpenses: (readonly Expense[])[] = [];

    service.expenses$.subscribe((value) => emittedExpenses.push(value));
    service.loadByWalletId('wallet-1');

    const request = httpMock.expectOne('/api/expenses/wallet/wallet-1?page=0&size=100');
    expect(request.request.method).toBe('GET');
    request.flush(pagedResponse([expense]));

    expect(emittedExpenses.at(-1)).toEqual([expense]);
  });

  it('should create an expense and prepend it to expenses$', () => {
    const input: CreateExpenseRequest = {
      name: 'Mercado',
      cost: 250,
      purchaseDate: '2026-04-29',
      walletId: 'wallet-1',
    };
    const createdExpense: Expense = {
      id: 'expense-2',
      name: input.name,
      cost: input.cost,
      remaining: input.cost,
      purchaseDate: input.purchaseDate,
      walletId: input.walletId,
      paymentIds: [],
    };
    const emittedExpenses: (readonly Expense[])[] = [];

    service.expenses$.subscribe((value) => emittedExpenses.push(value));
    service.create(input).subscribe((result) => expect(result).toEqual(createdExpense));

    const request = httpMock.expectOne('/api/expenses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(createdExpense);

    expect(emittedExpenses.at(-1)).toEqual([createdExpense]);
  });

  it('should delete an expense and remove it from expenses$', () => {
    const emittedExpenses: (readonly Expense[])[] = [];

    service.expenses$.subscribe((value) => emittedExpenses.push(value));
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/expenses/wallet/wallet-1?page=0&size=100').flush(pagedResponse([expense]));

    service.delete(expense.id).subscribe();

    const request = httpMock.expectOne('/api/expenses/expense-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    expect(emittedExpenses.at(-1)).toEqual([]);
  });
});

const expense: Expense = {
  id: 'expense-1',
  name: 'Mercado',
  cost: 250,
  purchaseDate: '2026-04-29',
  remaining: 100,
  walletId: 'wallet-1',
  paymentIds: ['payment-1'],
};

function pagedResponse(content: readonly Expense[]): PagedExpenseResponse {
  return {
    content,
    page: 0,
    size: 100,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
  };
}
