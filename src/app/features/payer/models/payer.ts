export type PayerType = 'STANDING' | 'TRANSIENT';

export interface Payer {
  readonly id: string;
  readonly name: string;
  readonly type: PayerType;
  readonly walletId: string | null;
  readonly subscriptionId: string | null;
  readonly paymentDate: string;
  readonly amountDue: number;
  readonly currency: string;
  readonly deleted: boolean;
}

export interface CreatePayerRequest {
  readonly name: string;
  readonly type: PayerType;
  readonly walletId?: string;
  readonly paymentDate: string;
  readonly subscriptionId?: string;
}

export interface PatchPayerRequest {
  readonly name?: string;
  readonly type?: PayerType;
  readonly walletId?: string;
  readonly paymentDate?: string;
  readonly subscriptionId?: string;
}
