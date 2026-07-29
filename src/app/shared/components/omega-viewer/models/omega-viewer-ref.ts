/** The three item kinds the Omega Viewer can display. */
export type OmegaViewerItemKind = 'EXPENSE' | 'INSTALLMENT' | 'SUBSCRIPTION';

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
