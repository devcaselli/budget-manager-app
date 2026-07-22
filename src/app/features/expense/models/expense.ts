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

/** Absent = don't touch current tags; [] clears all; non-empty replaces the whole set. */
export interface PatchExpenseRequest {
  readonly tagIds?: readonly string[];
}

export interface PagedExpenseResponse {
  readonly content: readonly Expense[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
