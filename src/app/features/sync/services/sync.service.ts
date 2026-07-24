import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, finalize, Observable, ReplaySubject, tap } from 'rxjs';

import { environment } from '@environments/environment';

import { SyncIngestResult } from '../models/sync';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly syncUrl = `${environment.apiUrl}/sync`;

  private readonly syncingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly syncing$ = this.syncingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  /**
   * POST /sync/ingest — triggers a bank-SMS ingest run for the authenticated owner
   * (no body; owner derived from the auth token). Returns the run's report plus the
   * current full `PENDING_REVIEW` list in one round-trip (`SyncIngestResponseDto`,
   * backend slice `sync`), so callers can populate the review screen without a
   * follow-up `GET /pending-reviews`.
   */
  ingest(): Observable<SyncIngestResult> {
    const subject = new ReplaySubject<SyncIngestResult>(1);

    this.syncingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<SyncIngestResult>(`${this.syncUrl}/ingest`, {})
      .pipe(
        tap({
          error: () => this.errorSubject.next('Could not run sync.'),
        }),
        finalize(() => this.syncingSubject.next(false)),
      )
      .subscribe({
        next: (result) => {
          subject.next(result);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }
}
