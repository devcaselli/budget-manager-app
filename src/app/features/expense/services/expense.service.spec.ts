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

  it('should not send unhidden when loadByWalletId is called without it (default false)', () => {
    service.loadByWalletId('wallet-1');

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/expenses/wallet/wallet-1',
    );
    expect(request.request.params.has('unhidden')).toBe(false);
    request.flush(pagedResponse([expense]));
  });

  it('should send unhidden=true when loadByWalletId is called with unhidden=true', () => {
    service.loadByWalletId('wallet-1', true);

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/expenses/wallet/wallet-1',
    );
    expect(request.request.params.get('unhidden')).toBe('true');
    request.flush(pagedResponse([expense]));
  });

  it('should only let the latest loadByWalletId trigger populate expenses$ (switchMap guard)', () => {
    const emittedExpenses: (readonly Expense[])[] = [];
    service.expenses$.subscribe((value) => emittedExpenses.push(value));

    service.loadByWalletId('wallet-1');
    service.loadByWalletId('wallet-1', true);

    const requests = httpMock.match(
      (candidate) => candidate.url === '/api/expenses/wallet/wallet-1',
    );
    expect(requests).toHaveLength(2);

    const staleRequest = requests.find((r) => !r.request.params.has('unhidden'));
    const latestRequest = requests.find((r) => r.request.params.get('unhidden') === 'true');
    expect(staleRequest).toBeDefined();
    expect(latestRequest).toBeDefined();

    // switchMap already unsubscribed the stale request when the second trigger fired —
    // it's cancelled outright (flushing it throws), proving there's no way for a slow
    // first response to win a race against a faster second one.
    expect(staleRequest!.cancelled).toBe(true);

    const latestExpense: Expense = { ...expense, id: 'latest-expense' };
    latestRequest!.flush(pagedResponse([latestExpense]));

    expect(emittedExpenses.at(-1)).toEqual([latestExpense]);
  });

  it('should create an expense and prepend it to expenses$', () => {
    const input: CreateExpenseRequest = {
      name: 'Mercado',
      cost: 250,
      purchaseDate: '2026-04-29',
      walletId: 'wallet-1',
      creditCardId: 'card-1',
    };
    const createdExpense: Expense = {
      id: 'expense-2',
      name: input.name,
      cost: input.cost,
      remaining: input.cost,
      purchaseDate: input.purchaseDate,
      walletId: input.walletId,
      installment: false,
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

  it('should PATCH /api/expenses/:id with only tagIds and replace it in expenses$', () => {
    const emittedExpenses: (readonly Expense[])[] = [];

    service.expenses$.subscribe((value) => emittedExpenses.push(value));
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/expenses/wallet/wallet-1?page=0&size=100').flush(pagedResponse([expense]));

    const updated: Expense = { ...expense, tagIds: ['tag-1', 'tag-2'] };
    service.assignTags(expense.id, ['tag-1', 'tag-2']).subscribe((result) => expect(result).toEqual(updated));

    const request = httpMock.expectOne('/api/expenses/expense-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ tagIds: ['tag-1', 'tag-2'] });
    request.flush(updated);

    expect(emittedExpenses.at(-1)).toEqual([updated]);
  });

  it('should send an empty array to clear all tags via assignTags', () => {
    service.assignTags(expense.id, []).subscribe();

    const request = httpMock.expectOne('/api/expenses/expense-1');
    expect(request.request.body).toEqual({ tagIds: [] });
    request.flush({ ...expense, tagIds: [] });
  });

  it('F-06: should PATCH /api/expenses/:id with the widened editable fields (name/cost/purchaseDate/creditCardId/details)', () => {
    const emittedExpenses: (readonly Expense[])[] = [];

    service.expenses$.subscribe((value) => emittedExpenses.push(value));
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/expenses/wallet/wallet-1?page=0&size=100').flush(pagedResponse([expense]));

    const updated: Expense = {
      ...expense,
      name: 'Mercado (editado)',
      cost: 300,
      purchaseDate: '2026-05-01',
      creditCardId: 'card-2',
      details: 'Compra parcelada',
    };

    service
      .patch(expense.id, {
        name: 'Mercado (editado)',
        cost: 300,
        purchaseDate: '2026-05-01',
        creditCardId: 'card-2',
        details: 'Compra parcelada',
      })
      .subscribe((result) => expect(result).toEqual(updated));

    const request = httpMock.expectOne('/api/expenses/expense-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      name: 'Mercado (editado)',
      cost: 300,
      purchaseDate: '2026-05-01',
      creditCardId: 'card-2',
      details: 'Compra parcelada',
    });
    request.flush(updated);

    expect(emittedExpenses.at(-1)).toEqual([updated]);
  });

  it('F-06: should PATCH with only the fields provided, leaving the rest absent (backend "absent = don\'t touch" semantics)', () => {
    service.patch(expense.id, { cost: 999 }).subscribe();

    const request = httpMock.expectOne('/api/expenses/expense-1');
    expect(request.request.body).toEqual({ cost: 999 });
    request.flush({ ...expense, cost: 999 });
  });

  it('should propagate an assignTags error and surface it via error$', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    let errored = false;
    service.assignTags(expense.id, ['tag-1']).subscribe({ error: () => (errored = true) });

    httpMock.expectOne('/api/expenses/expense-1').flush(null, { status: 500, statusText: 'Error' });

    expect(errored).toBe(true);
    expect(errors.at(-1)).toBe(
      'Expense salva, mas as tags não puderam ser aplicadas. Tente novamente na linha dela.',
    );
  });
});

const expense: Expense = {
  id: 'expense-1',
  name: 'Mercado',
  cost: 250,
  purchaseDate: '2026-04-29',
  remaining: 100,
  walletId: 'wallet-1',
  installment: false,
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
