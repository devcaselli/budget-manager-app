import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ExpenseViewerResponseDto,
  InstallmentViewerResponseDto,
  SubscriptionViewerResponseDto,
} from './models/omega-viewer-dto';
import {
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerSubscriptionDetail,
} from './models/omega-viewer-detail';
import { OmegaViewerService } from './omega-viewer.service';

function buildExpenseDto(overrides: Partial<ExpenseViewerResponseDto> = {}): ExpenseViewerResponseDto {
  return {
    id: 'expense-1',
    name: 'Groceries',
    cost: 100,
    remaining: 40,
    purchaseDate: '2026-07-01',
    walletId: 'wallet-1',
    creditCardId: 'card-1',
    flag: 'NONE',
    hidden: false,
    details: null,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-02T10:00:00Z',
    tags: [{ id: 'tag-1', name: 'Market' }],
    paymentTrace: [],
    refs: [],
    ...overrides,
  };
}

function buildInstallmentDto(
  overrides: Partial<InstallmentViewerResponseDto> = {},
): InstallmentViewerResponseDto {
  return {
    id: 'installment-1',
    description: 'Laptop',
    details: 'Note',
    originalValue: 3000,
    installmentValue: 250,
    currency: 'BRL',
    installmentNumber: 12,
    purchaseDate: '2026-01-01',
    lastInstallmentDate: '2026-12-01',
    creditCardId: 'card-1',
    sourceEffectiveMonth: '2026-01',
    deleted: false,
    deletedAt: null,
    flag: 'NONE',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-02-01T10:00:00Z',
    progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
    paymentTrace: [],
    refs: [],
    ...overrides,
  };
}

function buildSubscriptionDto(
  overrides: Partial<SubscriptionViewerResponseDto> = {},
): SubscriptionViewerResponseDto {
  return {
    id: 'subscription-1',
    description: 'Netflix',
    currency: 'BRL',
    startMonth: '2026-01',
    endMonth: null,
    state: 'PRODUCTION',
    creditCardId: 'card-1',
    flag: 'NONE',
    details: null,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    versions: [],
    ...overrides,
  };
}

describe('OmegaViewerService', () => {
  let service: OmegaViewerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OmegaViewerService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(OmegaViewerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  describe('EXPENSE', () => {
    it('calls GET /viewer/expenses/{id} and maps the response to OmegaViewerExpenseDetail', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock.expectOne('/api/viewer/expenses/expense-1').flush(buildExpenseDto());

      expect(result?.kind).toBe('EXPENSE');
      expect(result?.name).toBe('Groceries');
      expect(result?.cost).toBe(100);
      expect(result?.remaining).toBe(40);
      expect(result?.details).toBeNull();
      expect(result?.tagIds).toEqual(['tag-1']);
      // BrDatePipe (the template consumer) expects a bare LocalDate string and appends its
      // own time component — the service truncates the DTO's full Instant to date-only.
      expect(result?.audit).toEqual({
        createdAt: '2026-07-01',
        updatedAt: '2026-07-02',
        deletedAt: null,
      });
    });

    it('never calls the old fallback endpoint /expenses/{id}', () => {
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe();

      httpMock.expectOne('/api/viewer/expenses/expense-1').flush(buildExpenseDto());
      httpMock.expectNone('/api/expenses/expense-1');
    });

    it('maps refs with the backend-resolved label directly, without a second HTTP call', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock.expectOne('/api/viewer/expenses/expense-1').flush(
        buildExpenseDto({
          refs: [{ type: 'INSTALLMENT', id: 'installment-1', label: 'Parcelamento' }],
        }),
      );
      httpMock.verify();

      expect(result?.links).toEqual([
        { ref: { kind: 'INSTALLMENT', id: 'installment-1' }, label: 'Parcelamento' },
      ]);
    });

    it('always reports installmentsRemaining as null (the Expense DTO carries no progress field)', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock
        .expectOne('/api/viewer/expenses/expense-1')
        .flush(buildExpenseDto({ refs: [{ type: 'INSTALLMENT', id: 'installment-1', label: 'Parcelamento' }] }));

      expect(result?.installmentsRemaining).toBeNull();
    });

    it('always reports payerName as null (the DTO exposes payerIds per payment line, not a resolved name)', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock.expectOne('/api/viewer/expenses/expense-1').flush(buildExpenseDto());

      expect(result?.payerName).toBeNull();
    });

    it('maps paymentTrace lines to OmegaViewerPayment, preserving payerIds per line', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock.expectOne('/api/viewer/expenses/expense-1').flush(
        buildExpenseDto({
          paymentTrace: [
            {
              id: 'payment-1',
              amount: 40,
              paymentDate: '2026-07-05T12:00:00Z',
              bulletId: 'bullet-1',
              bulletDescription: 'Salary bullet',
              reversal: false,
              reversed: false,
              payerIds: ['user-1', 'user-2'],
            },
          ],
        }),
      );

      expect(result?.payments).toEqual([
        {
          id: 'payment-1',
          amount: 40,
          paymentDate: '2026-07-05T12:00:00Z',
          bulletId: 'bullet-1',
          bulletDescription: 'Salary bullet',
          reversal: false,
          reversed: false,
          payerIds: ['user-1', 'user-2'],
        },
      ]);
    });
  });

  describe('INSTALLMENT', () => {
    it('calls GET /viewer/installments/{id} and maps the response to OmegaViewerInstallmentDetail', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock.expectOne('/api/viewer/installments/installment-1').flush(buildInstallmentDto());

      expect(result?.kind).toBe('INSTALLMENT');
      expect(result?.description).toBe('Laptop');
      expect(result?.details).toBe('Note');
      expect(result?.audit).toEqual({
        createdAt: '2026-01-01',
        updatedAt: '2026-02-01',
        deletedAt: null,
      });
    });

    it('never calls the old fallback endpoint /installments/{id}', () => {
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe();

      httpMock.expectOne('/api/viewer/installments/installment-1').flush(buildInstallmentDto());
      httpMock.expectNone('/api/installments/installment-1');
    });

    it('maps the real InstallmentProgressDto counts, replacing the old installmentNumber placeholder', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock.expectOne('/api/viewer/installments/installment-1').flush(
        buildInstallmentDto({
          progress: { paidInstallments: 0, remainingInstallments: 12, totalInstallments: 12 },
        }),
      );

      expect(result?.progress).toEqual({
        paidInstallments: 0,
        remainingInstallments: 12,
        totalInstallments: 12,
      });
    });

    it('maps a deletedAt timestamp onto audit when the installment is soft-deleted', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock
        .expectOne('/api/viewer/installments/installment-1')
        .flush(buildInstallmentDto({ deleted: true, deletedAt: '2026-03-01T09:00:00Z' }));

      expect(result?.audit?.deletedAt).toBe('2026-03-01');
    });

    it('maps refs with the backend-resolved label directly', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock.expectOne('/api/viewer/installments/installment-1').flush(
        buildInstallmentDto({
          refs: [{ type: 'EXPENSE', id: 'expense-9', label: 'Laptop' }],
        }),
      );

      expect(result?.links).toEqual([{ ref: { kind: 'EXPENSE', id: 'expense-9' }, label: 'Laptop' }]);
    });

    it('maps paymentTrace lines to OmegaViewerPayment, same as EXPENSE (F-09)', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock.expectOne('/api/viewer/installments/installment-1').flush(
        buildInstallmentDto({
          paymentTrace: [
            {
              id: 'payment-1',
              amount: 250,
              paymentDate: '2026-07-05T12:00:00Z',
              bulletId: 'bullet-1',
              bulletDescription: 'Card bullet',
              reversal: false,
              reversed: false,
              payerIds: ['user-1'],
            },
          ],
        }),
      );

      expect(result?.payments).toEqual([
        {
          id: 'payment-1',
          amount: 250,
          paymentDate: '2026-07-05T12:00:00Z',
          bulletId: 'bullet-1',
          bulletDescription: 'Card bullet',
          reversal: false,
          reversed: false,
          payerIds: ['user-1'],
        },
      ]);
    });
  });

  describe('SUBSCRIPTION', () => {
    it('calls GET /viewer/subscriptions/{id} and maps the response to OmegaViewerSubscriptionDetail', () => {
      let result: OmegaViewerSubscriptionDetail | undefined;
      service.load({ kind: 'SUBSCRIPTION', id: 'subscription-1' }).subscribe((detail) => {
        result = detail as OmegaViewerSubscriptionDetail;
      });

      httpMock.expectOne('/api/viewer/subscriptions/subscription-1').flush(buildSubscriptionDto());

      expect(result?.kind).toBe('SUBSCRIPTION');
      expect(result?.description).toBe('Netflix');
      expect(result?.payerName).toBeNull();
      expect(result?.links).toEqual([]);
      expect(result?.audit).toEqual({
        createdAt: '2026-01-01',
        updatedAt: '2026-01-15',
        deletedAt: null,
      });
    });

    it('never calls the old fallback endpoint /subscriptions/{id}', () => {
      service.load({ kind: 'SUBSCRIPTION', id: 'subscription-1' }).subscribe();

      httpMock.expectOne('/api/viewer/subscriptions/subscription-1').flush(buildSubscriptionDto());
      httpMock.expectNone('/api/subscriptions/subscription-1');
    });

    it('maps state PREVIEW/PRODUCTION from the raw string state field', () => {
      let result: OmegaViewerSubscriptionDetail | undefined;
      service.load({ kind: 'SUBSCRIPTION', id: 'subscription-1' }).subscribe((detail) => {
        result = detail as OmegaViewerSubscriptionDetail;
      });

      httpMock
        .expectOne('/api/viewer/subscriptions/subscription-1')
        .flush(buildSubscriptionDto({ state: 'PREVIEW' }));

      expect(result?.state).toBe('PREVIEW');
    });
  });
});
