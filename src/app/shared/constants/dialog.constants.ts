/**
 * Desktop `MatDialog` sizing (Redesign v1 — D9). `Budget Redesign.dc.html`'s modal shell
 * (`panelStyle`) pins every non-mobile modal to a 544px centered panel — ported verbatim
 * here as a single source of truth so the 8 modal call sites don't each hardcode the same
 * magic width string. `maxWidth` keeps a 2rem breathing margin on narrow desktop viewports,
 * matching the pattern every dialog in this app already used pre-D9.
 *
 * Not used by dialogs that are deliberately wider than the design's 544px baseline for a
 * documented functional reason (e.g. the pending-review "imports" dialog, which hosts a
 * full editable table rather than the design's static checklist mock — see D9 handoff).
 */
export const DESKTOP_DIALOG_WIDTH = '34rem';
export const DESKTOP_DIALOG_MAX_WIDTH = 'calc(100vw - 2rem)';

/**
 * Dismissal baseline (Redesign v1 — D9 code review, Major-2). Every dialog in this app
 * keeps Material's default dismiss behavior (Escape closes, backdrop click closes,
 * `disableClose` unset) UNLESS it has a specific, documented reason not to. This is a
 * deliberate baseline, not an oversight — reviewed across all 8 D9 modal types and found
 * consistent except for two intentional exceptions:
 *
 * 1. `expense-delete-dialog` (see `ExpensePage.onDeleteClick()`) sets `disableClose: true`
 *    explicitly at its own `dialog.open()` call site — it's the one destructive/irreversible
 *    action in this epic, so a stray Escape or misclick must not delete an expense. The
 *    dialog's own "×" and "Cancel" buttons still close it via `dialogRef.close()`, which
 *    `disableClose` does not affect — only Escape/backdrop-click are suppressed.
 * 2. `OmegaViewerComponent` (the `details` modal) does NOT use `disableClose` at all —
 *    instead it toggles `dialogRef.disableClose` dynamically at runtime (`true` only while
 *    `mode() === 'EDIT'` or a notes form is being edited) and intercepts Escape/backdrop
 *    itself, routing both through its own `guardDirty()` confirm-before-discard flow. This
 *    is a finer-grained, pre-existing guard (predates D9) that subsumes what a static
 *    `disableClose` would give it — left as-is, not touched by D9.
 *
 * Every other dialog (create, pay, split, tags, imports, filters) stays on Material's plain
 * default: Escape and backdrop-click both close with no confirmation, because none of them
 * commit an irreversible action on open — cancelling loses at most an in-progress form,
 * which the create/pay/split/tags dialogs don't persist until their own explicit submit.
 */
