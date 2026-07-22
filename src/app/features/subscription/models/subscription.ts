export type SubscriptionState = 'PRODUCTION' | 'PREVIEW';
export type SubscriptionFlag = 'NONE' | 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION';

export interface SubscriptionVersion {
  readonly effectiveMonth: string;
  readonly amount: number;
}

export interface SubscriptionCreditCard {
  readonly id: string;
  readonly name: string;
}

export interface Subscription {
  readonly id: string;
  readonly description: string;
  readonly currency: string;
  readonly state: SubscriptionState;
  readonly flag: SubscriptionFlag;
  readonly startMonth: string;
  readonly endMonth: string | null;
  readonly versions: readonly SubscriptionVersion[];
  readonly creditCardId: string | null;
  readonly creditCard?: SubscriptionCreditCard | null;
  readonly tagIds?: readonly string[];
}

export interface CreateSubscriptionRequest {
  readonly description: string;
  readonly amount: number;
  readonly currency: string;
  readonly effectiveMonth?: string;
  readonly state?: SubscriptionState;
  readonly flag?: SubscriptionFlag;
  readonly creditCardId?: string;
}

export interface UpdateSubscriptionRequest {
  readonly description?: string;
  readonly newAmount?: number;
  readonly creditCardId?: string;
  /**
   * Month (YYYY-MM) an amount change takes effect — typically the effectiveMonth
   * of the wallet the user is editing from. Omitted → backend anchors to the clock month.
   */
  readonly effectiveMonth?: string;
  /** Absent = don't touch current tags; [] clears all; non-empty replaces the whole set. */
  readonly tagIds?: readonly string[];
}

export interface PagedSubscriptionResponse {
  readonly content: readonly Subscription[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
