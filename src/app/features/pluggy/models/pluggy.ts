/** Terminal + transient statuses a Pluggy item can report. */
export type PluggyItemStatus =
  | 'UPDATING'
  | 'UPDATED'
  | 'LOGIN_ERROR'
  | 'OUTDATED'
  | 'WAITING_USER_INPUT';

/** Status of a Pluggy item/connection as reported by the backend. */
export type PluggyConnectionStatus = PluggyItemStatus | string;

/** GET /pluggy/items/{itemId}/status response. */
export interface PluggyItemStatusResponse {
  readonly status: PluggyItemStatus;
}

/** A persisted bank connection (Pluggy item) owned by the current user. */
export interface PluggyConnection {
  readonly id: string;
  readonly itemId: string;
  readonly connectorId: number;
  readonly status: PluggyConnectionStatus;
  readonly accountIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A single transaction preview pulled from Pluggy (NOT yet materialized). */
export interface PluggyTransactionPreview {
  readonly id: string;
  readonly accountId: string;
  readonly description: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  /** True when this transaction already became an Expense (dedup guard). */
  readonly alreadyImported: boolean;
  /**
   * True when the transaction is an outgoing expense (amount < 0 at Pluggy).
   * Incoming/credit transactions come back with `isExpense: false` and are NOT
   * selectable for materialization (the backend silently skips them anyway).
   */
  readonly isExpense: boolean;
}

/** Outcome of a materialize request. */
export interface MaterializeResult {
  readonly created: number;
  readonly skipped: number;
  readonly fallback: number;
  readonly errors: number;
}

export const EMPTY_MATERIALIZE_RESULT: MaterializeResult = {
  created: 0,
  skipped: 0,
  fallback: 0,
  errors: 0,
};

// ── Request DTOs ─────────────────────────────────────────────────────────────

/** POST /pluggy/connect-token response. */
export interface ConnectTokenResponse {
  readonly connectToken: string;
}

/** POST /pluggy/items body — callback from the Connect widget. */
export interface RegisterItemRequest {
  readonly itemId: string;
}

/** Optional date range for a transactions preview query. */
export interface TransactionRange {
  readonly from?: string;
  readonly to?: string;
}

/**
 * POST /pluggy/items/{itemId}/materialize body.
 * Either an explicit selection (`transactionIds`) or `{ all: true }`.
 */
export type MaterializeRequest =
  | { readonly transactionIds: readonly string[] }
  | { readonly all: true };
