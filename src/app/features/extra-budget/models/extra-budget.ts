export interface ExtraBudgetAllocation {
  readonly bulletId: string;
  readonly amount: number;
}

export interface ExtraBudget {
  readonly id: string;
  readonly description: string;
  readonly walletId: string;
  readonly amount: number;
  readonly currency: string;
  readonly allocations: readonly ExtraBudgetAllocation[];
  readonly deleted: boolean;
  readonly deletedAt: string | null;
}

export interface CreateExtraBudgetRequest {
  readonly description: string;
  readonly walletId: string;
  readonly amount: number;
  readonly allocations: readonly ExtraBudgetAllocation[];
}
