import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Expense } from '@features/expense/models/expense';
import { Installment } from '@features/installment/models/installment';
import { Subscription } from '@features/subscription/models/subscription';

import {
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerSubscriptionDetail,
} from './models/omega-viewer-detail';
import { OmegaViewerService } from './omega-viewer.service';

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    name: 'Groceries',
    cost: 100,
    purchaseDate: '2026-07-01',
    remaining: 40,
    walletId: 'wallet-1',
    bulletId: 'bullet-1',
    creditCardId: 'card-1',
    installment: false,
    installmentNumber: null,
    installmentId: null,
    tagIds: ['tag-1'],
    ...overrides,
  };
}

function buildInstallment(overrides: Partial<Installment> = {}): Installment {
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
    sourceWalletId: 'wallet-1',
    sourceEffectiveMonth: '2026-01',
    shared: false,
    ownerRatio: null,
    effectiveOriginalValue: 3000,
    effectiveInstallmentValue: 250,
    tagIds: [],
    sourceExpenseId: null,
    ...overrides,
  };
}

function buildSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'subscription-1',
    description: 'Netflix',
    currency: 'BRL',
    state: 'PRODUCTION',
    flag: 'NONE',
    startMonth: '2026-01',
    endMonth: null,
    versions: [],
    creditCardId: 'card-1',
    tagIds: [],
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
    it('maps a linked expense to OmegaViewerExpenseDetail with a link to its installment', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush(buildExpense({ installmentId: 'installment-1' }));
      httpMock
        .expectOne('/api/installments/installment-1')
        .flush(buildInstallment({ id: 'installment-1', description: 'Laptop', installmentNumber: 5 }));

      expect(result?.kind).toBe('EXPENSE');
      expect(result?.name).toBe('Groceries');
      expect(result?.payerName).toBeNull();
      expect(result?.links).toEqual([
        { ref: { kind: 'INSTALLMENT', id: 'installment-1' }, label: 'Laptop' },
      ]);
      expect(result?.installmentsRemaining).toBe(5);
    });

    it('returns no links and installmentsRemaining=null when the expense has no installmentId', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock.expectOne('/api/expenses/expense-1').flush(buildExpense({ installmentId: null }));
      httpMock.expectNone('/api/installments/undefined');

      expect(result?.links).toEqual([]);
      expect(result?.installmentsRemaining).toBeNull();
    });

    it('keeps the link with a fallback label when the linked installment fetch fails', () => {
      let result: OmegaViewerExpenseDetail | undefined;
      service.load({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((detail) => {
        result = detail as OmegaViewerExpenseDetail;
      });

      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush(buildExpense({ installmentId: 'installment-missing' }));
      httpMock
        .expectOne('/api/installments/installment-missing')
        .flush('not found', { status: 404, statusText: 'Not Found' });

      expect(result?.links).toEqual([
        { ref: { kind: 'INSTALLMENT', id: 'installment-missing' }, label: 'Parcela vinculada' },
      ]);
      expect(result?.installmentsRemaining).toBeNull();
    });
  });

  describe('INSTALLMENT', () => {
    it('maps an installment to OmegaViewerInstallmentDetail with a link to its source expense', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock
        .expectOne('/api/installments/installment-1')
        .flush(buildInstallment({ sourceExpenseId: 'expense-9', description: 'Laptop' }));

      expect(result?.kind).toBe('INSTALLMENT');
      expect(result?.description).toBe('Laptop');
      expect(result?.payerName).toBeNull();
      expect(result?.links).toEqual([
        { ref: { kind: 'EXPENSE', id: 'expense-9' }, label: 'Laptop' },
      ]);
    });

    it('returns no links when sourceExpenseId is absent', () => {
      let result: OmegaViewerInstallmentDetail | undefined;
      service.load({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe((detail) => {
        result = detail as OmegaViewerInstallmentDetail;
      });

      httpMock
        .expectOne('/api/installments/installment-1')
        .flush(buildInstallment({ sourceExpenseId: null }));

      expect(result?.links).toEqual([]);
    });
  });

  describe('SUBSCRIPTION', () => {
    it('maps a subscription to OmegaViewerSubscriptionDetail with no links', () => {
      let result: OmegaViewerSubscriptionDetail | undefined;
      service.load({ kind: 'SUBSCRIPTION', id: 'subscription-1' }).subscribe((detail) => {
        result = detail as OmegaViewerSubscriptionDetail;
      });

      httpMock.expectOne('/api/subscriptions/subscription-1').flush(buildSubscription());

      expect(result?.kind).toBe('SUBSCRIPTION');
      expect(result?.description).toBe('Netflix');
      expect(result?.payerName).toBeNull();
      expect(result?.links).toEqual([]);
    });
  });
});
