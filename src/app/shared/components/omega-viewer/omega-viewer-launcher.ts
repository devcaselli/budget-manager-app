import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { inject, Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Observable, switchMap } from 'rxjs';

import { DESKTOP_DIALOG_MAX_WIDTH, DESKTOP_DIALOG_WIDTH } from '@shared/constants/dialog.constants';

import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';

/**
 * Opens the Omega Viewer modal. `open()` is the only method — deliberately not exposing
 * anything else, so every host page (Expense/Installment/Subscription pages, F-14/15/16)
 * integrates through this one call.
 *
 * Lazy-loads `OmegaViewerComponent` via a dynamic `import()` inside `open()`, so the
 * viewer's chunk stays out of the initial bundle of the 3 host pages — none of them
 * import the component directly, only this launcher (types-only import below, erased at
 * compile time).
 *
 * `providedIn: 'root'` is correct here (unlike `OmegaViewerService`): the launcher itself
 * holds no modal view-state, it is a stateless trigger.
 */
@Injectable({ providedIn: 'root' })
export class OmegaViewerLauncher {
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);

  open(ref: OmegaViewerRef): Observable<OmegaViewerResult> {
    return this.breakpointObserver.observe(Breakpoints.XSmall).pipe(
      switchMap(({ matches: isBelow600 }) => {
        // Desktop width matches the design's 544px modal shell (D9); mobile stays
        // full-screen — out of this epic's scope (D7/v1.1 owns the mobile variant).
        const config: MatDialogConfig<OmegaViewerRef> = isBelow600
          ? { width: '100vw', height: '100vh', maxWidth: '100vw', data: ref }
          : { width: DESKTOP_DIALOG_WIDTH, maxWidth: DESKTOP_DIALOG_MAX_WIDTH, data: ref };

        return new Observable<OmegaViewerResult>((subscriber) => {
          import('./omega-viewer.component').then(({ OmegaViewerComponent }) => {
            this.dialog
              .open<
                InstanceType<typeof OmegaViewerComponent>,
                OmegaViewerRef,
                OmegaViewerResult
              >(OmegaViewerComponent, config)
              .afterClosed()
              .subscribe({
                next: (result) => subscriber.next(result ?? { mutated: false }),
                error: (error: unknown) => subscriber.error(error),
                complete: () => subscriber.complete(),
              });
          });
        });
      }),
    );
  }
}
