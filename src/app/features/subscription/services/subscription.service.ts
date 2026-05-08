import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import {
  CreateSubscriptionRequest,
  PagedSubscriptionResponse,
  Subscription,
  UpdateSubscriptionRequest,
} from '../models/subscription';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly subscriptionsUrl = `${environment.apiUrl}/subscriptions`;

  private readonly subscriptionsSubject = new BehaviorSubject<readonly Subscription[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly updatingSubject = new BehaviorSubject<string | null>(null);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadSubscriptionsTrigger$ = new Subject<void>();
  private activeLoadingRequests = 0;

  readonly subscriptions$ = this.subscriptionsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly updating$ = this.updatingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadSubscriptionsTrigger$
      .pipe(
        tap(() => {
          this.errorSubject.next(null);
          this.startLoading();
        }),
        switchMap(() =>
          this.findAll().pipe(
            tap((response) => this.subscriptionsSubject.next(response.content)),
            catchError(() => {
              this.errorSubject.next('Nao foi possivel carregar as subscriptions.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
          ),
        ),
      )
      .subscribe();
  }

  findAll(page = 0, size = 100): Observable<PagedSubscriptionResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<PagedSubscriptionResponse>(this.subscriptionsUrl, { params });
  }

  create(input: CreateSubscriptionRequest): Observable<Subscription> {
    const createdSubscriptionSubject = new ReplaySubject<Subscription>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Subscription>(this.subscriptionsUrl, input)
      .pipe(
        tap({
          next: (subscription) => this.upsertSubscription(subscription),
          error: () => this.errorSubject.next('Nao foi possivel criar a subscription.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (subscription) => {
          createdSubscriptionSubject.next(subscription);
          createdSubscriptionSubject.complete();
        },
        error: (error: unknown) => createdSubscriptionSubject.error(error),
      });

    return createdSubscriptionSubject.asObservable();
  }

  update(id: string, input: UpdateSubscriptionRequest): Observable<Subscription> {
    const updatedSubscriptionSubject = new ReplaySubject<Subscription>(1);

    this.updatingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .patch<Subscription>(`${this.subscriptionsUrl}/${id}`, input)
      .pipe(
        tap({
          next: (subscription) => this.upsertSubscription(subscription),
          error: () => this.errorSubject.next('Nao foi possivel atualizar a subscription.'),
        }),
        finalize(() => this.updatingSubject.next(null)),
      )
      .subscribe({
        next: (subscription) => {
          updatedSubscriptionSubject.next(subscription);
          updatedSubscriptionSubject.complete();
        },
        error: (error: unknown) => updatedSubscriptionSubject.error(error),
      });

    return updatedSubscriptionSubject.asObservable();
  }

  delete(id: string): Observable<void> {
    const deletedSubscriptionSubject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.subscriptionsUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const currentSubscriptions = this.subscriptionsSubject.getValue();
            this.subscriptionsSubject.next(
              currentSubscriptions.filter((subscription) => subscription.id !== id),
            );
            this.loadSubscriptions();
          },
          error: () => this.errorSubject.next('Nao foi possivel remover a subscription.'),
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          deletedSubscriptionSubject.next();
          deletedSubscriptionSubject.complete();
        },
        error: (error: unknown) => deletedSubscriptionSubject.error(error),
      });

    return deletedSubscriptionSubject.asObservable();
  }

  loadSubscriptions(): void {
    this.loadSubscriptionsTrigger$.next();
  }

  private upsertSubscription(subscription: Subscription): void {
    const currentSubscriptions = this.subscriptionsSubject.getValue();

    this.subscriptionsSubject.next([
      subscription,
      ...currentSubscriptions.filter(
        (currentSubscription) => currentSubscription.id !== subscription.id,
      ),
    ]);
  }

  private startLoading(): void {
    this.activeLoadingRequests += 1;
    this.loadingSubject.next(true);
  }

  private stopLoading(): void {
    this.activeLoadingRequests = Math.max(this.activeLoadingRequests - 1, 0);
    this.loadingSubject.next(this.activeLoadingRequests > 0);
  }
}
