export interface SummaryCard {
  readonly label: string;
  readonly value: string;
  readonly icon: string;
  readonly helper: string;
}

export interface BulletBudget {
  readonly id: string;
  readonly name: string;
  readonly spent: string;
  readonly limit: string;
  readonly progress: number;
  readonly remaining: string;
}

export interface ExpenseUsage {
  readonly id: string;
  readonly name: string;
  readonly paid: string;
  readonly cost: string;
  readonly remaining: string;
  readonly purchaseDate: string;
  readonly progress: number;
}
