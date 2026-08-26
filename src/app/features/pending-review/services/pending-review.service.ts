import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, finalize, Observable, of, ReplaySubject, tap } from 'rxjs';

import { environment } from '@environments/environment';
import { SyncIngestResult, SyncReport } from '@features/sync/models/sync';

import { ConfirmPendingReviewsResult, PendingReview, PendingReviewPatchRequest } from '../models/pending-review';

@Injectable({ providedIn: 'root' })
export class PendingReviewService {
  private readonly http = inject(HttpClient);
  private readonly pendingReviewsUrl = `${environment.apiUrl}/pending-reviews`;

  private readonly pendingReviewsSubject = new BehaviorSubject<readonly PendingReview[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly confirmingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  /** Post-epic-audit P3-1: the most recent `POST /sync/ingest` run's report (created/
   *  skipped/fallback/errors counts), so the Expenses import banner can show a design-
   *  matching "N entries skipped · M errors" second line. Session-only — there is no
   *  backend endpoint to fetch a past report, so this is `null` until a sync happens in
   *  the current session (page reload loses it, same as the design's ephemeral banner). */
  private readonly lastSyncReportSubject = new BehaviorSubject<SyncReport | null>(null);

  readonly pendingReviews$ = this.pendingReviewsSubject.asObservable();
  readonly lastSyncReport$ = this.lastSyncReportSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  /** True while a `confirm()` POST is in flight. Exists so the UI can disable the Confirm
   *  button for the duration — without it, nothing stops a second click (slow network,
   *  impatient user) from firing a second POST /pending-reviews/confirm for the same ids
   *  before the first one lands. The backend dedupes ids *within* one request's array, but
   *  two separate concurrent requests race past its status check independently (TOCTOU —
   *  see Tech Debt: pending_review_confirm_race_duplicates_installment), each materializing
   *  its own Expense/Installment. This flag only closes the most common trigger (this
   *  button, this tab); it cannot fix the race itself, which needs a backend-side atomic
   *  status transition or unique index — out of frontend's reach. */
  readonly confirming$ = this.confirmingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  /** GET /pending-reviews — single fetch point, reused by the dedicated route and the modal. */
  loadAll(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .get<PendingReview[]>(this.pendingReviewsUrl)
      .pipe(
        tap((items) => this.pendingReviewsSubject.next(items)),
        catchError(() => {
          this.errorSubject.next('Could not load pending imports.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  /** PATCH /pending-reviews/{id} — upserts the returned item locally, no re-fetch. */
  patch(id: string, request: PendingReviewPatchRequest): Observable<PendingReview> {
    const subject = new ReplaySubject<PendingReview>(1);

    this.errorSubject.next(null);

    this.http
      .patch<PendingReview>(`${this.pendingReviewsUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => this.upsertLocal(updated),
          error: () => this.errorSubject.next('Could not save the change.'),
        }),
      )
      .subscribe({
        next: (updated) => {
          subject.next(updated);
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  /** DELETE /pending-reviews/{id} — 204 no content; removes the item locally on success. */
  discard(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.pendingReviewsUrl}/${id}`)
      .pipe(
        tap({
          next: () => this.removeLocal(id),
          error: () => this.errorSubject.next('Could not discard the item.'),
        }),
      )
      .subscribe({
        next: () => {
          subject.next();
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  /**
   * POST /pending-reviews/confirm — always HTTP 200, even with partial failures (not an
   * HTTP error). On success: items in `result.confirmed` are removed locally (materialized
   * into real Expenses); items in `result.failed` stay untouched (still `PENDING_REVIEW`
   * on the backend), so they remain visible/re-confirmable in the UI. Per-item failure
   * messages are the smart layer's responsibility (`PendingReviewPage.confirmErrorsById`)
   * — `error$` here is reserved for real network/HTTP failure of the POST itself.
   *
   * Empty `ids`: guarded locally, no HTTP call — mirrors the backend's `@NotEmpty`
   * validation and avoids a request that would just 400. Resolves immediately with an
   * empty result.
   */
  confirm(ids: readonly string[]): Observable<ConfirmPendingReviewsResult> {
    if (ids.length === 0) {
      return of({ confirmed: [], failed: [] });
    }

    const subject = new ReplaySubject<ConfirmPendingReviewsResult>(1);

    this.errorSubject.next(null);
    this.confirmingSubject.next(true);

    this.http
      .post<ConfirmPendingReviewsResult>(`${this.pendingReviewsUrl}/confirm`, { ids })
      .pipe(
        tap({
          next: (result) => this.removeConfirmedLocal(result),
          error: () => this.errorSubject.next('Could not confirm the selected imports.'),
        }),
        finalize(() => this.confirmingSubject.next(false)),
      )
      .subscribe({
        next: (result) => {
          subject.next(result);
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  /**
   * Synchronous, no HTTP — replaces the local list with the pending reviews returned
   * inline by `POST /sync/ingest` (Task 2's `SyncIngestResult`), avoiding a redundant
   * `GET /pending-reviews` right after a sync run.
   */
  applySyncResult(result: SyncIngestResult): void {
    this.pendingReviewsSubject.next(result.pendingReviews);
    this.lastSyncReportSubject.next(result.report);
  }

  private upsertLocal(updated: PendingReview): void {
    const current = this.pendingReviewsSubject.getValue();
    this.pendingReviewsSubject.next(current.map((item) => (item.id === updated.id ? updated : item)));
  }

  private removeLocal(id: string): void {
    const current = this.pendingReviewsSubject.getValue();
    this.pendingReviewsSubject.next(current.filter((item) => item.id !== id));
  }

  private removeConfirmedLocal(result: ConfirmPendingReviewsResult): void {
    const confirmedIds = new Set(result.confirmed.map((item) => item.pendingExpenseReviewId));
    const current = this.pendingReviewsSubject.getValue();
    this.pendingReviewsSubject.next(current.filter((item) => !confirmedIds.has(item.id)));
  }
}
