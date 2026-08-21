/**
 * The four item kinds the Omega Viewer can display. `RESERVED_BUDGET_MIGRATION` was added in
 * RBM-F14 — its `id` is the `extraBudgetId` that materializes the migration (the same id
 * `ReservedBudgetService.deleteMigration()` takes), not a `ReservedBudget` id: it's "the
 * migration" that opens, not "the reserve with focus on the migration" (confirmed by the real
 * endpoint's `@PathVariable` semantics — RBM-F1).
 */
export type OmegaViewerItemKind =
  | 'EXPENSE'
  | 'INSTALLMENT'
  | 'SUBSCRIPTION'
  | 'RESERVED_BUDGET_MIGRATION';

/**
 * Identifies a single item to load into the viewer — either the item the launcher was
 * opened with, or the target of a page-flip navigation (`navigateTo`) inside the shell.
 */
export interface OmegaViewerRef {
  readonly kind: OmegaViewerItemKind;
  readonly id: string;
}

/** A cross-reference to another item, rendered as a page-flip navigation row. */
export interface OmegaViewerLink {
  readonly ref: OmegaViewerRef;
  readonly label: string;
}
