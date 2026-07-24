import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

import { PendingReviewListComponent } from '../../components/pending-review-list/pending-review-list.component';
import { PendingReviewService } from '../../services/pending-review.service';

/**
 * Smart page — resolves state via `PendingReviewService`, passes the list to the dumb
 * `pending-review-list`, and translates its outputs into service calls. Hosted either
 * by a dedicated route (Task 4) or inside a `MatDialog` (Task 5) — this component knows
 * about neither, keeping it reusable in both containers.
 */
@Component({
  selector: 'app-pending-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PendingReviewListComponent],
  templateUrl: './pending-review-page.html',
  styleUrl: './pending-review-page.scss',
})
export class PendingReviewPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingReviewService = inject(PendingReviewService);

  protected readonly items = toSignal(this.pendingReviewService.pendingReviews$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.pendingReviewService.loading$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.pendingReviewService.error$, { initialValue: null });

  /** Populated from the last `confirm()` result's `failed` items — keyed by
   * `pendingExpenseReviewId`. Task 6 exercises this end-to-end; wired here so the
   * `errorsById` contract into `pending-review-list` doesn't change later. */
  protected readonly confirmErrorsById = signal<ReadonlyMap<string, string>>(new Map());

  constructor() {
    // Only fetch if the service doesn't already have data — avoids a redundant GET right
    // after a sync run already populated it via `applySyncResult` (Task 2/4/5). Chosen over
    // "always call loadAll()" to not throw away the fresh list a just-completed sync provides.
    // `pendingReviews$` is a BehaviorSubject, so `take(1)` reads the current snapshot
    // synchronously without triggering any HTTP call itself.
    this.pendingReviewService.pendingReviews$.pipe(take(1)).subscribe((items) => {
      if (items.length === 0) {
        this.pendingReviewService.loadAll();
      }
    });
  }

  protected onRename(event: { id: string; value: string }): void {
    this.pendingReviewService
      .patch(event.id, { nameOverride: event.value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  /**
   * No-op by design: `installmentNumber` is the only backend field, there's no separate
   * "isInstallment" flag to patch. Turning the toggle on doesn't call the backend until
   * the user picks a number (`onSetInstallmentNumber`); turning it off has no backend
   * representation to clear `installmentNumber` back to null (see model doc — out of scope).
   */
  protected onToggleInstallment(): void {
    // Intentionally empty — see doc comment above.
  }

  protected onSetInstallmentNumber(event: { id: string; value: number }): void {
    this.pendingReviewService
      .patch(event.id, { installmentNumber: event.value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  protected onDiscard(id: string): void {
    this.pendingReviewService
      .discard(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  protected onConfirmSelected(ids: readonly string[]): void {
    if (ids.length === 0) {
      return;
    }

    this.pendingReviewService
      .confirm(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const errors = new Map(result.failed.map((item) => [item.pendingExpenseReviewId, item.errorMessage]));
          this.confirmErrorsById.set(errors);
        },
        error: () => undefined,
      });
  }
}
