import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  Subject,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';
import { CreatePayerRequest, Payer, PatchPayerRequest } from '../models/payer';

@Injectable({ providedIn: 'root' })
export class PayerService {
  private readonly http = inject(HttpClient);
  private readonly payersUrl = `${environment.apiUrl}/payers`;

  private readonly payersSubject = new BehaviorSubject<readonly Payer[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly payers$ = this.payersSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  load(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .get<Payer[]>(this.payersUrl)
      .pipe(
        tap((payers) => this.payersSubject.next(payers)),
        catchError(() => {
          this.errorSubject.next('Could not load payers.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  save(request: CreatePayerRequest): Observable<Payer> {
    const subject = new ReplaySubject<Payer>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Payer>(this.payersUrl, request)
      .pipe(
        tap({
          next: (created) => {
            const current = this.payersSubject.getValue();
            this.payersSubject.next([...current, created]);
          },
          error: () => this.errorSubject.next('Could not create payer.'),
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

  patch(id: string, request: PatchPayerRequest): Observable<Payer> {
    const subject = new ReplaySubject<Payer>(1);

    this.errorSubject.next(null);

    this.http
      .patch<Payer>(`${this.payersUrl}/${id}`, request)
      .pipe(
        tap({
          next: (updated) => {
            const current = this.payersSubject.getValue();
            this.payersSubject.next(current.map((p) => (p.id === id ? updated : p)));
          },
          error: () => this.errorSubject.next('Could not update payer.'),
        }),
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

  delete(id: string): Observable<void> {
    const subject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.payersUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const current = this.payersSubject.getValue();
            this.payersSubject.next(current.filter((p) => p.id !== id));
          },
          error: () => this.errorSubject.next('Could not delete payer.'),
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
}
