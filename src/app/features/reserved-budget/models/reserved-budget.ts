export type ReservedBudgetFlag = 'NONE';

export type ReservedBudgetLinkSourceType = 'SUBSCRIPTION' | 'INSTALLMENT';

/**
 * Modality of `DELETE /reserved-budgets/{id}`. Confirmed 1:1 against the backend enum
 * `br.com.casellisoftware.budgetmanager.domain.reservedbudget.ReservedBudgetDeleteMode`
 * (RBM-F1 gate, 2026-08-21): `END` (Modalidade A — "Encerrar") and `SKIP_MONTH`
 * (Modalidade B — "Pular este mês"). **Not** `END_FROM_MONTH` — the frontend-tasks.md draft
 * assumed that name; the real backend value is `END`.
 */
export type ReservedBudgetDeleteMode = 'END' | 'SKIP_MONTH';

export interface ReservedBudgetVersion {
  readonly effectiveMonth: string;
  readonly amount: number;
}

export interface ReservedBudgetLink {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  readonly fromMonth: string;
}

/**
 * One migration embedded in `ReservedBudget.migrations`. Confirmed 1:1 against
 * `ReservedBudgetMigrationResponseDto` (RBM-F1 gate, 2026-08-21).
 */
export interface ReservedBudgetMigration {
  /** Id of the `ExtraBudget` that materializes the migration — this is what `DELETE
   * /reserved-budgets/{id}/migrations/{extraBudgetId}` receives. There is no separate
   * migration id. */
  readonly extraBudgetId: string;
  readonly bulletId: string;
  /** Already resolved by the backend; no id lookup needed on the happy path. */
  readonly bulletDescription: string;
  readonly amount: number;
  /** Month (`YYYY-MM`) the migration is effective in; never leaks into the following month. */
  readonly effectiveMonth: string;
  readonly description: string;
}

/**
 * Body for `POST /reserved-budgets/{id}/migrations`. Confirmed 1:1 against
 * `ReservedBudgetMigrationRequestDto` (RBM-F1 gate, 2026-08-21).
 */
export interface CreateReservedBudgetMigrationRequest {
  /** Required — defines the effective month on the backend (decision 5) and the wallet the
   * target bullet must belong to. */
  readonly walletId: string;
  readonly bulletId: string;
  readonly amount: number;
  readonly description?: string;
}

export interface ReservedBudget {
  readonly id: string;
  readonly description: string;
  readonly details: string | null;
  readonly currency: string;
  readonly startMonth: string;
  readonly versions: readonly ReservedBudgetVersion[];
  readonly links: readonly ReservedBudgetLink[];
  readonly deleted: boolean;
  readonly flag: ReservedBudgetFlag;
  /** Post-share amount consumed by links applicable in the target month; null on the plain paginated list. */
  readonly consumedAmount?: number | null;
  /**
   * `resolveAmount(month) − consumedAmount − migratedAmount` for the target month; null on the
   * plain paginated list. Changed semantics from the pre-migration version (used to be without
   * `− migratedAmount`) — the frontend must NOT add `migratedAmount` back on top of this value
   * anywhere (cap checks in RBM-F3/F5/F6 read this field as-is); doing so would silently reopen
   * the overcommit that the backend's cap validator now prevents server-side.
   */
  readonly remainingAmount?: number | null;
  /** Sum of this month's migrations; `null` on the plain paginated list (no `activeAt`), same as
   * `consumedAmount`/`remainingAmount`. */
  readonly migratedAmount?: number | null;
  /** This month's migrations; `[]` when a target month was resolved and there are none, `null`
   * when there is no target month (plain paginated list). */
  readonly migrations?: readonly ReservedBudgetMigration[] | null;
  /** First "dead" month (exclusive-right window `[startMonth, endMonth)`) once `END` has been
   * applied — the reserved budget stops being applicable starting at this month itself. `null`
   * if never ended. Never call this "inclusive" — see the backend Javadoc on
   * `ReservedBudget.isApplicable` for why that word is banned for this field. */
  readonly endMonth?: string | null;
  /** Months (`YYYY-MM`) individually skipped via `SKIP_MONTH`. Always present (possibly empty),
   * unlike `migrations`/`endMonth` which can be absent/null. */
  readonly skippedMonths?: readonly string[];
}

export interface CreateReservedBudgetRequest {
  readonly description: string;
  readonly details?: string | null;
  readonly budget: number;
  readonly currency: string;
  readonly effectiveMonth: string;
  readonly flag?: ReservedBudgetFlag;
}

export interface UpdateReservedBudgetRequest {
  readonly description?: string;
  readonly details?: string | null;
  readonly newAmount?: number;
  readonly flag?: ReservedBudgetFlag;
  /** Month (`YYYY-MM`) from which `newAmount` takes effect; only meaningful alongside `newAmount`. */
  readonly effectiveMonth?: string;
}

export interface LinkReservedBudgetSourceRequest {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  /** Month (`YYYY-MM`) from which the link is effective. */
  readonly fromMonth: string;
}

export interface PagedReservedBudgetResponse {
  readonly content: readonly ReservedBudget[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/**
 * One migration blocking a `DELETE /reserved-budgets/{id}` call, as carried on the 409
 * `ProblemDetail.migrations` array. Confirmed 1:1 against
 * `ReservedBudgetHasActiveMigrationsException.BlockingMigration`
 * (`GlobalExceptionHandler.handleReservedBudgetHasActiveMigrations`, RBM-F1 gate, 2026-08-21).
 * `bulletDescription` can genuinely be `null` (bullet batch-resolution unavailable) — the
 * backend uses a real `null`, not `''`, specifically so the frontend can tell "no description"
 * apart from "resolution failed" and fall back to its own bullet store in the latter case.
 */
export interface ReservedBudgetBlockingMigration {
  readonly extraBudgetId: string;
  readonly bulletId: string;
  readonly bulletDescription: string | null;
  readonly amount: number;
}

/**
 * Shape of the 409 `ProblemDetail` body for `ReservedBudgetHasActiveMigrationsException` —
 * thrown by `DELETE /reserved-budgets/{id}` (both `END` and `SKIP_MONTH`) when the target
 * month has a live migration. **Symmetric**: identical shape for both modes; `mode` exists only
 * for logging/telemetry on the backend and carries no decision weight on the frontend.
 *
 * ⚠️ **Divergence from the RBM-F1 task draft, registered instead of silently "fixed"**: the
 * draft asked for a machine-readable `code` on this error, mirroring `AuthErrorCode`
 * (`core/auth/auth.model.ts:209`, backed by a `code` property that
 * `GlobalExceptionHandler`'s AUTH handlers do set). Read against the real
 * `GlobalExceptionHandler.handleReservedBudgetHasActiveMigrations` (infra, 2026-08-21): **no
 * `code` property is set** — only `title`, `detail`, `correlationId`, and these domain
 * properties. The `code` convention is scoped to AUTH handlers only per that class's own class
 * Javadoc ("Scoped to auth handlers only"); this is not a bug, it's a narrower contract than
 * Sword & Shield's. Consequence for the frontend: this error must be identified **structurally**
 * (presence of `migrationCount`/`migrations` on the 409 body — see `isReservedBudgetHasActiveMigrationsProblem`
 * below), never by matching `title`/`detail` text. If the backend later adds a `code` here, this
 * guard should switch to reading it instead — tracked as a nice-to-have, not blocking.
 */
export interface ReservedBudgetHasActiveMigrationsProblem {
  readonly title: string;
  readonly detail: string;
  readonly reservedBudgetId: string;
  readonly mode: ReservedBudgetDeleteMode;
  readonly month: string;
  readonly migrationCount: number;
  readonly migrations: readonly ReservedBudgetBlockingMigration[];
}

/**
 * Structural type guard for {@link ReservedBudgetHasActiveMigrationsProblem} — checks for the
 * fields that only this error's `ProblemDetail` carries (`migrationCount` + `migrations` array),
 * since there is no `code` to discriminate on (see the docstring above). Callers should still
 * gate on the HTTP status being 409 before calling this; the guard only disambiguates *which*
 * 409 shape was received.
 */
export function isReservedBudgetHasActiveMigrationsProblem(
  body: unknown,
): body is ReservedBudgetHasActiveMigrationsProblem {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>)['migrationCount'] === 'number' &&
    Array.isArray((body as Record<string, unknown>)['migrations'])
  );
}

/**
 * Shape of the 409 `ProblemDetail` body for `MigrationNotReversibleException` — thrown by
 * `DELETE /reserved-budgets/{id}/migrations/{extraBudgetId}` (and by manual `ExtraBudget`
 * delete, RBM-B6) when reverting would require debiting more from the bullet's remaining
 * balance than it currently has. Confirmed 1:1 against
 * `GlobalExceptionHandler.handleMigrationNotReversible` (RBM-F1 gate, 2026-08-21). Same
 * no-`code` divergence as {@link ReservedBudgetHasActiveMigrationsProblem} — identify
 * structurally via `isMigrationNotReversibleProblem`, not by status/text alone (a manual
 * `ExtraBudget` delete produces the exact same shape and status).
 */
export interface MigrationNotReversibleProblem {
  readonly title: string;
  readonly detail: string;
  readonly bulletId: string;
  readonly remaining: number;
  readonly required: number;
}

export function isMigrationNotReversibleProblem(
  body: unknown,
): body is MigrationNotReversibleProblem {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>)['bulletId'] === 'string' &&
    typeof (body as Record<string, unknown>)['remaining'] === 'number' &&
    typeof (body as Record<string, unknown>)['required'] === 'number'
  );
}
