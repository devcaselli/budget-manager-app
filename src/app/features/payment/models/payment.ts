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
