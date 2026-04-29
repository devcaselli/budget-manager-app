import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PayExpenseRequest } from '../models/payment';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should pay an expense via POST /api/pay?walletId=:walletId', () => {
    const request: PayExpenseRequest = {
      walletId: 'wallet-1',
      body: {
        payment: {
          amount: 120,
          currency: 'BRL',
          paymentDate: '2026-04-29T12:00:00.000Z',
          details: 'Parcela mercado',
        },
        bulletId: 'bullet-1',
        expenseId: 'expense-1',
      },
    };

    service.payExpense(request).subscribe((result) => expect(result).toBeUndefined());

    const httpRequest = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/pay' && candidate.params.get('walletId') === 'wallet-1',
    );
    expect(httpRequest.request.method).toBe('POST');
    expect(httpRequest.request.body).toEqual(request.body);
    httpRequest.flush(null);
  });

  it('should expose an error message when payment fails', () => {
    const errors: (string | null)[] = [];

    service.error$.subscribe((value) => errors.push(value));
    service.payExpense({
      walletId: 'wallet-1',
      body: {
        payment: {
          amount: 120,
          currency: 'BRL',
          paymentDate: '2026-04-29T12:00:00.000Z',
          details: null,
        },
        bulletId: 'bullet-1',
        expenseId: 'expense-1',
      },
    }).subscribe({
      error: () => undefined,
    });

    const httpRequest = httpMock.expectOne('/api/pay?walletId=wallet-1');
    httpRequest.flush({ message: 'Conflict' }, { status: 409, statusText: 'Conflict' });

    expect(errors.at(-1)).toBe('Nao foi possivel registrar o pagamento.');
  });
});
