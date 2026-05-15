export type ShareSourceType = 'EXPENSE' | 'SUBSCRIPTION' | 'INSTALLMENT';
export type ShareStatus = 'ACTIVE' | 'REVERTED';
export type ShareQuotaMode = 'EXISTING' | 'TRANSIENT';

export interface ShareQuota {
  readonly payerId: string;
  readonly payerName: string;
  readonly ratio: number;
  readonly amount: number;
  readonly paymentIds: readonly string[];
}

export interface Share {
  readonly id: string;
  readonly walletId: string;
  readonly sourceType: ShareSourceType;
  readonly sourceId: string;
  readonly totalAmount: number;
  readonly ownerShare: number;
  readonly ownerRatio: number;
  readonly currency: string;
  readonly status: ShareStatus;
  readonly quotas: readonly ShareQuota[];
  readonly paymentIds: readonly string[];
  readonly createdAt: string;
  readonly revertedAt: string | null;
}

export interface TransientSharePayerRequest {
  readonly name: string;
  readonly paymentDate?: string;
}

export interface ShareQuotaRequest {
  readonly payerId?: string;
  readonly transient_?: TransientSharePayerRequest;
  readonly amount: number;
}

export interface CreateShareRequest {
  readonly walletId: string;
  readonly sourceType: ShareSourceType;
  readonly sourceId: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly ownerShare: number;
  readonly quotas: readonly ShareQuotaRequest[];
}
