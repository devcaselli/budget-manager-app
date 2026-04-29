export interface Wallet {
  readonly id: string;
  readonly description: string;
  readonly budget: number;
  readonly remaining: number;
  readonly startDate: string;
  readonly closedDate: string | null;
  readonly closed: boolean;
}

export interface CreateWalletRequest {
  readonly description: string | null;
  readonly budget: number;
  readonly startDate: string;
  readonly closedDate: string | null;
  readonly closed: boolean;
}
