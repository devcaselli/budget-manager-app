export interface Installment {
  readonly id: string;
  readonly description: string;
  readonly details?: string | null;
  readonly originalValue: number;
  readonly installmentValue: number;
  readonly currency: string;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly lastInstallmentDate: string;
  readonly creditCardId: string;
  readonly sourceWalletId: string;
  readonly sourceEffectiveMonth: string;
  readonly shared: boolean;
  readonly ownerRatio: number | null;
  readonly effectiveOriginalValue: number;
  readonly effectiveInstallmentValue: number;
}

export interface CreditCard {
  readonly id: string;
  readonly name: string;
}

export type InstallmentSortOrder = 'ENDING_SOON' | 'ENDING_LATE';

export interface SaveInstallmentRequest {
  readonly description: string;
  readonly details?: string;
  readonly originalValue?: number;
  readonly installmentValue?: number;
  readonly currency: string;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly creditCardId: string;
  readonly sourceEffectiveMonth: string;
}

export interface PatchInstallmentRequest {
  readonly details?: string | null;
  readonly originalValue?: number | null;
  readonly installmentValue?: number | null;
  readonly installmentNumber?: number | null;
  readonly sourceEffectiveMonth?: string | null;
  readonly purchaseDate?: string | null;
  readonly creditCardId?: string | null;
}

export interface PagedInstallmentResponse {
  readonly content: readonly Installment[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface PagedCreditCardResponse {
  readonly content: readonly CreditCard[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly page: number;
  readonly size: number;
}
