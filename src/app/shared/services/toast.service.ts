import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** How long a toast stays on screen before auto-dismissing (ms). */
const TOAST_DURATION_MS = 4000;

/**
 * P2-2 (post-epic-audit): thin wrapper around `MatSnackBar` giving the app one
 * consistent toast call site. The design (`Budget Redesign.dc.html` ~L812-817, ~L1265)
 * specs a `position:fixed; bottom:28px; left:50%` toast with a 12px radius and a
 * "Dismiss" action in `--accent-fg` — achieved here via `panelClass: 'ew-toast'` +
 * `horizontalPosition: 'center'` / `verticalPosition: 'bottom'`, with the actual
 * chrome styled in `styles.scss` (`.ew-toast` override block) following the same
 * `--mat-*` token-pinning pattern D2 already used for dialogs/buttons/icons — see the
 * "Material system tokens (Redesign v1 — D2)" section of `:root` there.
 *
 * `MatSnackBar` was chosen over a custom component: the app already depends on
 * Angular Material (dialogs, menus, icons), its CDK overlay gives correct stacking/
 * a11y (`role="status"`/`aria-live`) for free, and only its container chrome needs
 * overriding to match the design — no new dependency, no reimplementing overlay
 * positioning/animation/timers from scratch.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);

  /** Shows a short success/info toast with a "Dismiss" action, auto-closing after 4s. */
  show(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: TOAST_DURATION_MS,
      panelClass: ['ew-toast'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
