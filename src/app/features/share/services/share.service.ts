import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import { CreateShareRequest, Share } from '../models/share';

@Injectable({
  providedIn: 'root',
})
export class ShareService {
  private readonly http = inject(HttpClient);
  private readonly sharesUrl = `${environment.apiUrl}/shares`;

  private readonly sharesSubject = new BehaviorSubject<readonly Share[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly revertingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly shares$ = this.sharesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly reverting$ = this.revertingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  load(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .get<Share[]>(this.sharesUrl)
      .pipe(
        tap((shares) => this.sharesSubject.next(shares)),
        catchError(() => {
          this.errorSubject.next('Unable to load shares.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  create(request: CreateShareRequest): Observable<Share> {
    const subject = new ReplaySubject<Share>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Share>(this.sharesUrl, request)
      .pipe(
        tap({
          next: (created) => {
            const current = this.sharesSubject.getValue();
            this.sharesSubject.next([
              created,
              ...current.filter((share) => share.id !== created.id),
            ]);
          },
          error: () => this.errorSubject.next('Unable to create the share.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (created) => {
          subject.next(created);
          subject.complete();
        },
        error: (error: unknown) => subject.error(error),
      });

    return subject.asObservable();
  }

  revert(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.revertingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .post<void>(`${this.sharesUrl}/${id}/revert`, null)
      .pipe(
        tap({
          next: () => this.load(),
          error: () => this.errorSubject.next('Unable to revert the share.'),
        }),
        finalize(() => this.revertingSubject.next(null)),
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
}
