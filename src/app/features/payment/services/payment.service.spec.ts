import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PagedPaymentResponse, PayExpenseRequest, Payment } from '../models/payment';
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
    httpMock.verify({ ignoreCancelled: true });
  });

  it('should return payments by wallet id via GET /api/payments/wallet/:walletId', () => {
    const response = pagedResponse([payment]);

    service.findByWalletId('wallet-1').subscribe((result) => expect(result).toEqual(response));

    const request = httpMock.expectOne('/api/payments/wallet/wallet-1?page=0&size=100');
    expect(request.request.method).toBe('GET');
    request.flush(response);
  });

  it('should populate payments$ with loadByWalletId API response', () => {
    const emittedPayments: (readonly Payment[])[] = [];

    service.payments$.subscribe((value) => emittedPayments.push(value));
    service.loadByWalletId('wallet-1');

    const request = httpMock.expectOne('/api/payments/wallet/wallet-1?page=0&size=100');
    expect(request.request.method).toBe('GET');
    request.flush(pagedResponse([payment]));

    expect(emittedPayments.at(-1)).toEqual([payment]);
  });

  it('should walk every page of a multi-page wallet and concatenate them into payments$', () => {
    const emittedPayments: (readonly Payment[])[] = [];
    const page0Payment: Payment = { ...payment, id: 'payment-page-0' };
    const page1Payment: Payment = { ...payment, id: 'payment-page-1' };

    service.payments$.subscribe((value) => emittedPayments.push(value));
    service.loadByWalletId('wallet-1');

    httpMock
      .expectOne('/api/payments/wallet/wallet-1?page=0&size=100')
      .flush(multiPageResponse([page0Payment], 0, 2));
    httpMock
      .expectOne('/api/payments/wallet/wallet-1?page=1&size=100')
      .flush(multiPageResponse([page1Payment], 1, 2));

    expect(emittedPayments.at(-1)).toEqual([page0Payment, page1Payment]);
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

    expect(errors.at(-1)).toBe('Could not record the payment.');
  });

  describe('revert', () => {
    it('should POST to /api/payments/:id/revert with a null body and return the reversal payment', () => {
      const reversal: Payment = { ...payment, id: 'payment-2', reversal: true };

      let result: Payment | undefined;
      service.revert('payment-1').subscribe((value) => (result = value));

      const request = httpMock.expectOne('/api/payments/payment-1/revert');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toBeNull();
      request.flush(reversal, { status: 201, statusText: 'Created' });

      expect(result).toEqual(reversal);
    });

    it('should track reverting$ with the payment id while the call is in flight', () => {
      const states: (string | null)[] = [];
      service.reverting$.subscribe((value) => states.push(value));

      service.revert('payment-1').subscribe();
      expect(states.at(-1)).toBe('payment-1');

      httpMock
        .expectOne('/api/payments/payment-1/revert')
        .flush({ ...payment, id: 'payment-2', reversal: true }, { status: 201, statusText: 'Created' });

      expect(states.at(-1)).toBeNull();
    });

    it('should set error$ to a generic message on a non-422 failure', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.revert('payment-1').subscribe({ error: () => undefined });

      httpMock
        .expectOne('/api/payments/payment-1/revert')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(errors.at(-1)).toBe('Could not revert the payment.');
    });

    it.each([
      ['SHARED_PAYMENT', 'Shared payments are reverted from the Share screen.'],
      ['ALREADY_A_REVERSAL', 'This payment is already a reversal and cannot be reverted again.'],
      ['ALREADY_REVERTED', 'This payment has already been reverted.'],
      ['NO_BULLET', 'This payment is not linked to a bullet and cannot be reverted.'],
    ])('should map the 422 reason %s to a specific message', (reason, expected) => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.revert('payment-1').subscribe({ error: () => undefined });

      httpMock
        .expectOne('/api/payments/payment-1/revert')
        .flush(
          { reason, paymentId: 'payment-1' },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(errors.at(-1)).toBe(expected);
    });

    it('should propagate the error to the caller (not swallow it)', () => {
      let caughtError: unknown;
      service.revert('payment-1').subscribe({ error: (error: unknown) => (caughtError = error) });

      httpMock
        .expectOne('/api/payments/payment-1/revert')
        .flush(
          { reason: 'ALREADY_REVERTED', paymentId: 'payment-1' },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(caughtError).toBeDefined();
    });
  });
});

const payment: Payment = {
  id: 'payment-1',
  amount: 120,
  currency: 'BRL',
  paymentDate: '2026-04-29T12:00:00.000Z',
  details: 'Parcela mercado',
  expenseId: 'expense-1',
  walletId: 'wallet-1',
  bulletId: 'bullet-1',
  flag: 'NONE',
  kind: 'NORMAL',
  payerId: null,
  shareId: null,
  reversal: false,
  reversedPaymentId: null,
};

function pagedResponse(content: readonly Payment[]): PagedPaymentResponse {
  return {
    content,
    page: 0,
    size: 100,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
  };
}

function multiPageResponse(
  content: readonly Payment[],
  page: number,
  totalPages: number,
): PagedPaymentResponse {
  return { content, page, size: 100, totalElements: totalPages * 100, totalPages };
}
