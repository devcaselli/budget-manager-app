export type ShareSourceType = 'EXPENSE' | 'SUBSCRIPTION' | 'INSTALLMENT';
export type ShareStatus = 'ACTIVE' | 'REVERTED';
export type ShareQuotaMode = 'EXISTING' | 'TRANSIENT';
/** UI-only: whether the create-share form's quotas are entered as fixed R$ amounts or
 *  as percentages of the source total. Never sent to the backend — `CreateShareRequest`
 *  always carries R$ amounts; PERCENT is converted client-side before submit (see
 *  ShareFormComponent.createShare()). The backend absorbs any rounding drift from that
 *  conversion via `Share.balanceTolerance(n) = 0.01 * (n+1)` (backend-tasks.md Task 3) —
 *  do not add a "fix the last cent" step here, it isn't needed and would be fragile. */
export type ShareSplitMode = 'FIXED' | 'PERCENT';

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
  /** Nome legível do source, resolvido pelo backend. `null` quando o source foi
   *  deletado ou pertence a outro owner. */
  readonly sourceName: string | null;
  readonly totalAmount: number;
  readonly ownerShare: number;
  readonly ownerRatio: number;
  readonly currency: string;
  readonly status: ShareStatus;
  readonly quotas: readonly ShareQuota[];
  readonly paymentIds: readonly string[];
  readonly createdAt: string;
  readonly revertedAt: string | null;
  /** YearMonth ("2026-06") from which the recurring share is stopped, or null. */
  readonly stoppedFromMonth: string | null;
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
