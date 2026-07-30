import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, map, of, switchMap } from 'rxjs';

import { BrDatePipe } from '@shared/pipes/br-date.pipe';

import { OmegaViewerDetail } from './models/omega-viewer-detail';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { OmegaViewerService } from './omega-viewer.service';

/** Discriminates the 3 outcomes `detailState` can be in at any point in time. */
type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly detail: OmegaViewerDetail };

/**
 * Omega Viewer shell — a modal that shows one item (Expense/Installment/Subscription) at
 * a time with page-flip navigation between linked items. This task (F-05) delivers the
 * navigable shell only: a `history` stack, detail resolution per current ref, loading/
 * error/retry states, and a bare-bones per-kind body. No edit mode (F-07), no payments
 * section (F-09), no notes (F-08) yet — those plug into this shell later.
 *
 * `OmegaViewerService` is provided here at component scope (`providers: [OmegaViewerService]`)
 * — it is modal view-state, not an app-lifetime singleton, so it must NOT be
 * `providedIn: 'root'` (would leak state/subscriptions across separate viewer sessions).
 *
 * Back always refetches — no caching across the stack (confirmed decision, see the Omega
 * Viewer README's decisions table). This keeps `history` a plain array of refs, never of
 * resolved details.
 */
@Component({
  selector: 'app-omega-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule, BrDatePipe],
  providers: [OmegaViewerService],
  templateUrl: './omega-viewer.component.html',
  styleUrl: './omega-viewer.component.scss',
})
export class OmegaViewerComponent {
  private readonly dialogRef =
    inject<MatDialogRef<OmegaViewerComponent, OmegaViewerResult>>(MatDialogRef);
  private readonly viewerService = inject(OmegaViewerService);
  private readonly initialRef = inject<OmegaViewerRef>(MAT_DIALOG_DATA);

  /** Navigation stack — index 0 is the item the viewer was opened with. */
  private readonly history = signal<readonly OmegaViewerRef[]>([this.initialRef]);
  /** Set whenever a mutation happens anywhere in the stack (edit save, note save, payment
   * revert, in later tasks) — surfaces as `OmegaViewerResult.mutated` on close regardless
   * of which item was on screen when the mutation occurred. */
  private readonly mutated = signal(false);

  protected readonly current = computed<OmegaViewerRef>(() => {
    const stack = this.history();
    return stack[stack.length - 1];
  });
  protected readonly canGoBack = computed(() => this.history().length > 1);

  /**
   * `switchMap` over `toObservable(current)` — cancels any in-flight `load()` request the
   * instant `current()` changes (rapid navigateTo/goBack clicks), so a slow, now-abandoned
   * response can never overwrite a newer navigation's result.
   */
  protected readonly detailState = toSignal(
    toObservable(this.current).pipe(
      switchMap((ref) =>
        this.viewerService.load(ref).pipe(
          map((detail): DetailState => ({ status: 'ready', detail })),
          catchError(() => of<DetailState>({ status: 'error' })),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as DetailState },
  );

  /** Non-null only while `detailState().status === 'ready'` — split out so the template
   * can bind to a properly-typed `OmegaViewerDetail` without an `$any()` cast. */
  protected readonly readyDetail = computed<OmegaViewerDetail | null>(() => {
    const state = this.detailState();
    return state.status === 'ready' ? state.detail : null;
  });

  protected navigateTo(ref: OmegaViewerRef): void {
    this.history.update((stack) => [...stack, ref]);
  }

  protected goBack(): void {
    this.history.update((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  }

  protected retry(): void {
    // Re-push the same ref so `current` emits a new reference and the switchMap re-fires,
    // even though the value is structurally identical to what's already at the top.
    this.history.update((stack) => [...stack.slice(0, -1), { ...stack[stack.length - 1] }]);
  }

  protected close(): void {
    this.dialogRef.close({ mutated: this.mutated() });
  }
}
