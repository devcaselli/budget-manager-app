export type ReservedBudgetFlag = 'NONE';

export interface ReservedBudgetVersion {
  readonly effectiveMonth: string;
  readonly amount: number;
}

export interface ReservedBudget {
  readonly id: string;
  readonly description: string;
  readonly details: string | null;
  readonly currency: string;
  readonly startMonth: string;
  readonly versions: readonly ReservedBudgetVersion[];
  readonly deleted: boolean;
  readonly flag: ReservedBudgetFlag;
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

export interface PagedReservedBudgetResponse {
  readonly content: readonly ReservedBudget[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
