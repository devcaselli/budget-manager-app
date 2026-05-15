export type PaymentKind = 'NORMAL' | 'SHARED';

export interface Payment {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly paymentDate: string;
  readonly details: string | null;
  readonly expenseId: string | null;
  readonly walletId: string;
  readonly bulletId: string | null;
  readonly flag: string;
  readonly kind: PaymentKind;
  readonly payerId: string | null;
  readonly shareId: string | null;
  readonly reversal: boolean;
  readonly reversedPaymentId: string | null;
}

export interface PagedPaymentResponse {
  readonly content: readonly Payment[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface PaymentRequest {
  readonly payment: {
    readonly amount: number;
    readonly currency: 'BRL';
    readonly paymentDate: string;
    readonly details: string | null;
  };
  readonly bulletId: string;
  readonly expenseId: string;
}

export interface PayExpenseRequest {
  readonly walletId: string;
  readonly body: PaymentRequest;
}
