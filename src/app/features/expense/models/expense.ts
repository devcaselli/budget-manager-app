export interface Expense {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;
  readonly remaining: number;
  readonly walletId: string;
  readonly paymentIds: readonly string[];
}

export interface CreateExpenseRequest {
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;
  readonly walletId: string;
}

export interface PagedExpenseResponse {
  readonly content: readonly Expense[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
