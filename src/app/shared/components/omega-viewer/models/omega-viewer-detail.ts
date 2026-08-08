import { PaymentKind } from '@features/payment/models/payment';

import { OmegaViewerLink, OmegaViewerRef } from './omega-viewer-ref';

/**
 * Audit metadata footer (F-13). `null` as a whole means "hidden entirely" — do not
 * collapse individual missing timestamps into this, the union member is either fully
 * present or fully absent.
 */
export interface OmegaViewerAudit {
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly deletedAt: string | null;
}

/**
 * A single payment/bullet row, used by the Expense and Installment payments sections
 * (F-09/F-10). Mirrors the backend's `PaymentTraceLineDto` — there is no
 * singular resolved payer name at this level (see `payerName` below), only the raw
 * `payerIds` of whoever the payment/share was split across; resolving those ids to
 * display names is F-09/F-10's job, not the mapping layer's.
 *
 * `kind` (`NORMAL` | `SHARED`) was added to the backend's `PaymentTraceLineDto` in
 * `budget-manager-api-public` commit `2f9b678`, closing the gap `isRevertablePayment`'s
 * doc comment previously called out: `SHARED` (payer-quota) payments can now be detected
 * client-side instead of only surfacing as a 422 `SHARED_PAYMENT` after the user clicks
 * "Reverter".
 */
export interface OmegaViewerPayment {
  readonly id: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly bulletId: string;
  readonly bulletDescription: string;
  readonly reversal: boolean;
  readonly reversed: boolean;
  readonly payerIds: readonly string[];
  readonly kind: PaymentKind;
}

/**
 * Real parcel-progress counts from the backend's `InstallmentProgressCalculator`
 * (`InstallmentProgressDto`). `paidInstallments`/`remainingInstallments` are counts, not a
 * boolean — `remainingInstallments === 0` (fully paid) and this whole field being present
 * are two different, both-valid states; there is no "not applicable" state for an
 * Installment's own progress (unlike Expense's `installmentsRemaining`, which can be `null`
 * because an Expense might not be installment-linked at all).
 */
export interface OmegaViewerInstallmentProgress {
  readonly paidInstallments: number;
  readonly remainingInstallments: number;
  readonly totalInstallments: number;
}

interface OmegaViewerDetailBase {
  readonly ref: OmegaViewerRef;
  readonly audit: OmegaViewerAudit | null;
  readonly links: readonly OmegaViewerLink[];
}

export interface OmegaViewerExpenseDetail extends OmegaViewerDetailBase {
  readonly kind: 'EXPENSE';
  readonly name: string;
  readonly cost: number;
  readonly remaining: number;
  readonly purchaseDate: string;
  readonly creditCardId: string | null;
  readonly details: string | null;
  readonly tagIds: readonly string[];
  /**
   * Always `null`. The real Viewer backend (`ExpenseViewerResponseDto`) does not expose a
   * single resolved payer name — only `payerIds` per line inside `paymentTrace`
   * (`OmegaViewerPayment.payerIds`), since a shared payment can have more than one payer.
   * Resolving those ids to display names is F-09's job (payments section UI), not this
   * mapping layer's — kept here, still typed, so F-09 doesn't need a model change to wire
   * a real value in later if a single-name affordance turns out to still make sense.
   */
  readonly payerName: string | null;
  readonly payments: readonly OmegaViewerPayment[];
  readonly installmentsRemaining: number | null;
}

export interface OmegaViewerInstallmentDetail extends OmegaViewerDetailBase {
  readonly kind: 'INSTALLMENT';
  readonly description: string;
  readonly originalValue: number;
  readonly installmentValue: number;
  readonly installmentNumber: number;
  readonly purchaseDate: string;
  readonly lastInstallmentDate: string;
  readonly creditCardId: string;
  readonly details: string | null;
  readonly tagIds: readonly string[];
  readonly payerName: string | null;
  readonly progress: OmegaViewerInstallmentProgress;
  /**
   * F-09: `InstallmentViewerResponseDto` already carries `paymentTrace` (confirmed in
   * `omega-viewer-dto.ts`) — this was simply never threaded through `mapInstallment` before
   * the payments section existed to consume it. Same shape/mapping as Expense's `payments`
   * (`mapPaymentTraceLine`), nothing invented.
   */
  readonly payments: readonly OmegaViewerPayment[];
}

export interface OmegaViewerSubscriptionDetail extends OmegaViewerDetailBase {
  readonly kind: 'SUBSCRIPTION';
  readonly description: string;
  readonly currency: string;
  readonly state: 'PRODUCTION' | 'PREVIEW';
  readonly startMonth: string;
  readonly endMonth: string | null;
  readonly creditCardId: string | null;
  readonly details: string | null;
  readonly tagIds: readonly string[];
  readonly payerName: string | null;
}

/** Discriminated union of the viewer's per-kind detail shapes, narrowable by `kind`. */
export type OmegaViewerDetail =
  | OmegaViewerExpenseDetail
  | OmegaViewerInstallmentDetail
  | OmegaViewerSubscriptionDetail;
