export type WalletState = 'PRODUCTION' | 'REVIEW' | 'PREVIEW';

export interface Wallet {
  readonly id: string;
  readonly description: string;
  readonly budget: number;
  readonly remaining: number;
  readonly startDate: string;
  readonly closedDate: string | null;
  readonly closed: boolean;
  readonly effectiveMonth: string;
  readonly state: WalletState;
}

export interface CreateWalletRequest {
  readonly description: string | null;
  readonly budget: number;
  readonly startDate: string;
  readonly closedDate: string | null;
  readonly closed: boolean;
  readonly effectiveMonth: string;
  readonly state: WalletState;
}
