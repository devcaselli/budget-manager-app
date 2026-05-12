export interface CreditCard {
  readonly id: string;
  readonly name: string;
}

export interface CreateCreditCardRequest {
  readonly name: string;
}

export interface PagedCreditCardResponse {
  readonly content: readonly CreditCard[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly page: number;
  readonly size: number;
}

/** Matches ExpenseResponseDto from the API */
export interface CreditCardCharge {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;   // ISO date (LocalDate → "YYYY-MM-DD")
  readonly remaining: number;
  readonly walletId: string;
  readonly creditCardId: string;
  readonly paymentIds: readonly string[];
}

/** Matches CreditCardExpensesResponseDto from the API */
export interface CreditCardExpensesResponse {
  readonly content: readonly CreditCardCharge[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly totalCost: number;
}
