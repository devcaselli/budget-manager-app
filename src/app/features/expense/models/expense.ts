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
  readonly bulletId?: string;
  /** Required by API (@NotBlank) — must always be sent */
  readonly creditCardId: string;
  /** Only sent when installment=true */
  readonly installment?: boolean;
  /** Only sent when installment=true; API requires min=2, max=120 */
  readonly installmentNumber?: number;
}

export interface PagedExpenseResponse {
  readonly content: readonly Expense[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
