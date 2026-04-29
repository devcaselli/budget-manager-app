export interface Payment {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly paymentDate: string;
  readonly details: string | null;
  readonly expenseId: string;
  readonly walletId: string;
  readonly bulletId: string;
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
