import { Expense } from '@features/expense/models/expense';
import { Installment } from '@features/installment/models/installment';

export interface CreditCard {
  readonly id: string;
  readonly name: string;
  readonly labels?: readonly string[];
}

export interface CreateCreditCardRequest {
  readonly name: string;
  /** Bank-SMS card name(s) for auto-sync matching. Max 20 items, each max 80 chars. */
  readonly labels?: readonly string[];
}

/** Absent = don't touch current labels; [] clears all; non-empty replaces the whole set. */
export interface PatchCreditCardRequest {
  readonly labels?: readonly string[];
}

export interface PagedCreditCardResponse {
  readonly content: readonly CreditCard[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly page: number;
  readonly size: number;
}

export interface CreditCardSubscriptionCharge {
  readonly id: string;
  readonly subscriptionId: string;
  readonly walletId: string | null;
  readonly month: string;
  readonly amount: number;
  readonly remaining: number;
  readonly flag: string;
  readonly shared: boolean;
  readonly effectiveOwnerAmount: number | null;
}

export interface CreditCardChargesResponse {
  readonly expenses: readonly Expense[];
  readonly installments: readonly Installment[];
  readonly subscriptions: readonly CreditCardSubscriptionCharge[];
  readonly totalCost: number;
}

export const EMPTY_CREDIT_CARD_CHARGES: CreditCardChargesResponse = {
  expenses: [],
  installments: [],
  subscriptions: [],
  totalCost: 0,
};
