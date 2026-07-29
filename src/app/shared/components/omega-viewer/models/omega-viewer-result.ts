/**
 * Result returned by `OmegaViewerLauncher.open()` when the modal closes. Callers use
 * `mutated` to decide whether to reload their list — `true` whenever anything the host
 * page's listing could reflect changed during the viewer session (edit save, note save,
 * payment revert), regardless of which item in the navigation stack the mutation happened
 * on or which item was on screen when the modal closed.
 */
export interface OmegaViewerResult {
  readonly mutated: boolean;
}
