export type ReservedBudgetFlag = 'NONE';

export type ReservedBudgetLinkSourceType = 'SUBSCRIPTION' | 'INSTALLMENT';

export interface ReservedBudgetVersion {
  readonly effectiveMonth: string;
  readonly amount: number;
}

export interface ReservedBudgetLink {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  readonly fromMonth: string;
}

export interface ReservedBudget {
  readonly id: string;
  readonly description: string;
  readonly details: string | null;
  readonly currency: string;
  readonly startMonth: string;
  readonly versions: readonly ReservedBudgetVersion[];
  readonly links: readonly ReservedBudgetLink[];
  readonly deleted: boolean;
  readonly flag: ReservedBudgetFlag;
  /** Post-share amount consumed by links applicable in the target month; null on the plain paginated list. */
  readonly consumedAmount?: number | null;
  /** `ceiling − consumedAmount` for the target month; null on the plain paginated list. */
  readonly remainingAmount?: number | null;
}

export interface CreateReservedBudgetRequest {
  readonly description: string;
  readonly details?: string | null;
  readonly budget: number;
  readonly currency: string;
  readonly effectiveMonth: string;
  readonly flag?: ReservedBudgetFlag;
}

export interface UpdateReservedBudgetRequest {
  readonly description?: string;
  readonly details?: string | null;
  readonly newAmount?: number;
  readonly flag?: ReservedBudgetFlag;
  /** Month (`YYYY-MM`) from which `newAmount` takes effect; only meaningful alongside `newAmount`. */
  readonly effectiveMonth?: string;
}

export interface LinkReservedBudgetSourceRequest {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  /** Month (`YYYY-MM`) from which the link is effective. */
  readonly fromMonth: string;
}

export interface PagedReservedBudgetResponse {
  readonly content: readonly ReservedBudget[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
