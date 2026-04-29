export interface SummaryCard {
  readonly label: string;
  readonly value: string;
  readonly icon: string;
  readonly helper: string;
}

export interface BudgetCategory {
  readonly name: string;
  readonly spent: string;
  readonly limit: string;
  readonly progress: number;
}
