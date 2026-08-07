export interface Expense {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;
  readonly remaining: number;
  readonly walletId: string;
  readonly bulletId?: string | null;
  readonly creditCardId?: string | null;
  readonly installment: boolean;
  readonly installmentNumber?: number | null;
  readonly installmentId?: string | null;
  readonly tagIds?: readonly string[];
  /**
   * Present on the backend's `ExpenseResponseDto` (F-06 confirmed) but unused by any
   * existing frontend call site until now — F-07's edit-form save flow needs it to layer a
   * patch response onto the Omega Viewer's displayed detail without a refetch.
   */
  readonly details?: string | null;
}

export type ChartPeriod = '12' | '24';

export interface CreateExpenseRequest {
  readonly name: string;
  readonly cost: number;
  readonly purchaseDate: string;
  readonly walletId: string;
  readonly bulletId?: string;
  /** Required by API (@NotBlank) — must always be sent */
  readonly creditCardId: string;
  /** Only sent when installment=true */
  readonly installment?: boolean;
  /** Only sent when installment=true; API requires min=2, max=120 */
  readonly installmentNumber?: number;
}

/**
 * Mirrors the backend's `PatchExpenseUseCase` (`ExpensePatch`) semantics: every field is
 * optional and independently "absent = don't touch that value". `tagIds` keeps its own
 * documented exception (`[]` clears all, non-empty replaces the whole set) — the other
 * fields have no such empty-array case since none of them are collections.
 */
export interface PatchExpenseRequest {
  readonly name?: string;
  readonly cost?: number;
  readonly purchaseDate?: string;
  readonly creditCardId?: string;
  readonly details?: string;
  /** Absent = don't touch current tags; [] clears all; non-empty replaces the whole set. */
  readonly tagIds?: readonly string[];
}

export interface PagedExpenseResponse {
  readonly content: readonly Expense[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
