import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, finalize, Observable, of, ReplaySubject, tap } from 'rxjs';

import { environment } from '@environments/environment';
import { SyncIngestResult } from '@features/sync/models/sync';

import { ConfirmPendingReviewsResult, PendingReview, PendingReviewPatchRequest } from '../models/pending-review';

@Injectable({ providedIn: 'root' })
export class PendingReviewService {
  private readonly http = inject(HttpClient);
  private readonly pendingReviewsUrl = `${environment.apiUrl}/pending-reviews`;

  private readonly pendingReviewsSubject = new BehaviorSubject<readonly PendingReview[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly pendingReviews$ = this.pendingReviewsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
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
          this.errorSubject.next('Não foi possível carregar as importações pendentes.');
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
          error: () => this.errorSubject.next('Não foi possível salvar a alteração.'),
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
          error: () => this.errorSubject.next('Não foi possível excluir o item.'),
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

    this.http
      .post<ConfirmPendingReviewsResult>(`${this.pendingReviewsUrl}/confirm`, { ids })
      .pipe(
        tap({
          next: (result) => this.removeConfirmedLocal(result),
          error: () => this.errorSubject.next('Não foi possível confirmar as importações selecionadas.'),
        }),
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
