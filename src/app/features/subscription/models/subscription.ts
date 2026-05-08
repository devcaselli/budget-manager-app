export type SubscriptionState = 'PRODUCTION' | 'PREVIEW';
export type SubscriptionFlag = 'NONE' | 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION';

export interface SubscriptionVersion {
  readonly effectiveMonth: string;
  readonly amount: number;
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
}

export interface CreateSubscriptionRequest {
  readonly description: string;
  readonly amount: number;
  readonly currency: string;
  readonly effectiveMonth?: string;
  readonly state?: SubscriptionState;
  readonly flag?: SubscriptionFlag;
}

export interface UpdateSubscriptionRequest {
  readonly description?: string;
  readonly newAmount?: number;
}

export interface PagedSubscriptionResponse {
  readonly content: readonly Subscription[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
