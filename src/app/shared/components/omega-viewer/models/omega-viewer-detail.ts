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

/** A single payment/bullet row, used by the Expense payments section (F-09). */
export interface OmegaViewerPayment {
  readonly id: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly kind: 'NORMAL' | 'SHARED';
  readonly reversal: boolean;
  readonly reversedPaymentId: string | null;
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
  /** Requires the backend's Payment→Share resolution chain — not derivable client-side. */
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
