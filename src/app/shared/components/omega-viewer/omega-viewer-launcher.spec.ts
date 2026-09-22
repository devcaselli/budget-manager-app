import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';

import { OmegaViewerResult } from './models/omega-viewer-result';
import { OmegaViewerLauncher } from './omega-viewer-launcher';

describe('OmegaViewerLauncher', () => {
  let launcher: OmegaViewerLauncher;
  let dialogOpenSpy: ReturnType<typeof vi.fn>;
  let afterClosedSubject: Subject<OmegaViewerResult | undefined>;
  let breakpointMatches: boolean;

  beforeEach(() => {
    afterClosedSubject = new Subject<OmegaViewerResult | undefined>();
    breakpointMatches = false;

    dialogOpenSpy = vi.fn().mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
    } as unknown as MatDialogRef<unknown, OmegaViewerResult>);

    TestBed.configureTestingModule({
      providers: [
        OmegaViewerLauncher,
        { provide: MatDialog, useValue: { open: dialogOpenSpy } },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: breakpointMatches }) },
        },
      ],
    });

    launcher = TestBed.inject(OmegaViewerLauncher);
  });

  it('opens the dialog with the desktop width config above 600px', async () => {
    breakpointMatches = false;

    launcher.open({ kind: 'EXPENSE', id: 'expense-1' }).subscribe();
    await waitUntil(() => dialogOpenSpy.mock.calls.length > 0);

    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);
    const [, config] = dialogOpenSpy.mock.calls[0] as [unknown, MatDialogConfig];
    // D9: desktop dialog width dropped from 720px to the design's 544px (34rem) standard,
    // shared by every desktop modal in the Redesign v1 epic (DESKTOP_DIALOG_WIDTH). Review
    // Minor-1: maxWidth now also comes from the shared constant (was hardcoded '95vw').
    expect(config.width).toBe('34rem');
    expect(config.maxWidth).toBe('calc(100vw - 2rem)');
    expect(config.data).toEqual({ kind: 'EXPENSE', id: 'expense-1' });
  });

  it('opens the dialog with a full-screen config below 600px', async () => {
    breakpointMatches = true;

    launcher.open({ kind: 'INSTALLMENT', id: 'installment-1' }).subscribe();
    await waitUntil(() => dialogOpenSpy.mock.calls.length > 0);

    const [, config] = dialogOpenSpy.mock.calls[0] as [unknown, MatDialogConfig];
    expect(config.width).toBe('100vw');
    expect(config.height).toBe('100vh');
  });

  it('propagates the afterClosed() result via open()', async () => {
    const results: OmegaViewerResult[] = [];
    launcher.open({ kind: 'SUBSCRIPTION', id: 'subscription-1' }).subscribe((result) => {
      results.push(result);
    });
    await waitUntil(() => dialogOpenSpy.mock.calls.length > 0);

    afterClosedSubject.next({ mutated: true });

    expect(results).toEqual([{ mutated: true }]);
  });

  it('defaults to mutated:false when the dialog closes with no result', async () => {
    const results: OmegaViewerResult[] = [];
    launcher.open({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((result) => {
      results.push(result);
    });
    await waitUntil(() => dialogOpenSpy.mock.calls.length > 0);

    afterClosedSubject.next(undefined);

    expect(results).toEqual([{ mutated: false }]);
  });
});

/** Dynamic `import()` of the real OmegaViewerComponent goes through the module loader, not
 * a single microtask — polls the given predicate with a bounded deadline instead of
 * assuming a fixed tick count or a fixed total wait. */
async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
