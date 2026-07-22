import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import { SaveTagRequest, Tag, UpdateTagRequest } from '../models/tag';

@Injectable({ providedIn: 'root' })
export class TagService {
  private readonly http = inject(HttpClient);
  private readonly tagsUrl = `${environment.apiUrl}/tags`;

  private readonly tagsSubject = new BehaviorSubject<readonly Tag[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly tags$ = this.tagsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  loadAll(): void {
    this.fetchAll().subscribe();
  }

  private fetchAll(): Observable<Tag[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http.get<Tag[]>(this.tagsUrl).pipe(
      tap((tags) => this.tagsSubject.next(tags)),
      catchError(() => {
        this.errorSubject.next('Não foi possível carregar as tags.');
        return EMPTY;
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  create(request: SaveTagRequest): Observable<Tag> {
    const subject = new ReplaySubject<Tag>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Tag>(this.tagsUrl, request)
      .pipe(
        tap({
          next: (created) => {
            const current = this.tagsSubject.getValue();
            this.tagsSubject.next([...current, created]);
          },
          error: (err: unknown) => this.errorSubject.next(this.saveErrorMessage(err)),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (created) => {
          subject.next(created);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  update(id: string, request: UpdateTagRequest): Observable<Tag> {
    const subject = new ReplaySubject<Tag>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .put<Tag>(`${this.tagsUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => {
            const current = this.tagsSubject.getValue();
            this.tagsSubject.next(current.map((t) => (t.id === id ? updated : t)));
          },
          error: (err: unknown) => this.errorSubject.next(this.saveErrorMessage(err)),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (updated) => {
          subject.next(updated);
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  /**
   * Deletes a tag. Backend cascades to its direct subtags server-side (1-level hierarchy, so
   * no grandchildren to worry about) — the frontend reloads the full list to reflect the
   * cascade, since the API only reports the deleted tag's own id.
   *
   * `deletingId()` stays set until the reload finishes (not just the DELETE response) so the
   * row's delete button can't be clicked again on stale, about-to-disappear data.
   */
  delete(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.tagsUrl}/${id}`)
      .pipe(
        switchMap(() => this.fetchAll()),
        catchError((err: unknown) => {
          this.errorSubject.next('Não foi possível excluir a tag.');
          throw err;
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          subject.next();
          subject.complete();
        },
        error: (err: unknown) => subject.error(err),
      });

    return subject.asObservable();
  }

  /** 422 = TagHierarchyViolationException (subtag-of-subtag); anything else is generic. */
  private saveErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      return 'Uma subtag não pode ser usada como tag-pai.';
    }
    return 'Não foi possível salvar a tag.';
  }
}
