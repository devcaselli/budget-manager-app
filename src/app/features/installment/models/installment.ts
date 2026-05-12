export interface Installment {
  readonly id: string;
  readonly description: string;
  readonly originalValue: number;
  readonly installmentValue: number;
  readonly currency: string;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly lastInstallmentDate: string;
  readonly creditCardId: string;
  readonly sourceWalletId: string;
  readonly sourceEffectiveMonth: string;
}

export interface CreditCard {
  readonly id: string;
  readonly name: string;
}

export interface PagedCreditCardResponse {
  readonly content: readonly CreditCard[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly page: number;
  readonly size: number;
}
