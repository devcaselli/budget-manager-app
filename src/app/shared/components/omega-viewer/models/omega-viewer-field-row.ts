/**
 * A single precomputed label/value row for `ViewerFieldListComponent`. Built entirely by
 * the shell's field-mapping helper (`omega-viewer-field-mapper.ts`) — the component itself
 * performs no formatting/lookup, only display, per F-12's "dumb component" requirement.
 */
export interface OmegaViewerFieldRow {
  /** Stable key for `track` — the field name, e.g. `'purchaseDate'`. */
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** `true` applies the project's `.ew-blur` privacy-mode class (monetary values only). */
  readonly sensitive: boolean;
}

/**
 * The two states `installmentsRemaining` can render as. `0` (fully paid) and `null` (not an
 * installment-linked item) must stay visually distinct — never collapsed into "nothing shown".
 */
export type OmegaViewerRemainingBadge =
  | { readonly kind: 'none' }
  | { readonly kind: 'remaining'; readonly count: number };
