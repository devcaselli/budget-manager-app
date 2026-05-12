import { HttpClient, HttpParams } from '@angular/common/http';
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

import {
  CreditCard,
  CreditCardCharge,
  CreditCardExpensesResponse,
  CreateCreditCardRequest,
  PagedCreditCardResponse,
} from '../models/credit-card';

export interface LoadChargesParams {
  /** Credit card ID (required — API endpoint is /credit-cards/{id}/expenses) */
  readonly creditCardId: string;
  /** ISO year-month string e.g. "2026-05" — maps to ?effectiveMonth=YYYY-MM */
  readonly effectiveMonth?: string;
  readonly name?: string;
}

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  private readonly http = inject(HttpClient);
  private readonly creditCardsUrl = `${environment.apiUrl}/credit-cards`;

  private readonly cardsSubject = new BehaviorSubject<readonly CreditCard[]>([]);
  private readonly chargesSubject = new BehaviorSubject<readonly CreditCardCharge[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly cards$ = this.cardsSubject.asObservable();
  readonly charges$ = this.chargesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  loadAll(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const params = new HttpParams().set('page', 0).set('size', 100);

    this.http
      .get<PagedCreditCardResponse>(this.creditCardsUrl, { params })
      .pipe(
        tap((response) => this.cardsSubject.next(response.content)),
        catchError(() => {
          this.errorSubject.next('Could not load credit cards.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  /**
   * Loads charges for a specific credit card.
   * API: GET /credit-cards/{id}/expenses?effectiveMonth=YYYY-MM&name=...&page=0&size=200
   */
  loadCharges(params: LoadChargesParams): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    let httpParams = new HttpParams().set('page', 0).set('size', 100);

    if (params.effectiveMonth) {
      httpParams = httpParams.set('effectiveMonth', params.effectiveMonth);
    }
    if (params.name) {
      httpParams = httpParams.set('name', params.name);
    }

    this.http
      .get<CreditCardExpensesResponse>(
        `${this.creditCardsUrl}/${params.creditCardId}/expenses`,
        { params: httpParams },
      )
      .pipe(
        tap((response) => this.chargesSubject.next(response.content)),
        catchError(() => {
          this.errorSubject.next('Could not load charges.');
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false)),
      )
      .subscribe();
  }

  clearCharges(): void {
    this.chargesSubject.next([]);
  }

  create(input: CreateCreditCardRequest): Observable<CreditCard> {
    const subject = new ReplaySubject<CreditCard>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<CreditCard>(this.creditCardsUrl, input)
      .pipe(
        tap({
          next: (card) => {
            const current = this.cardsSubject.getValue();
            this.cardsSubject.next([...current, card]);
          },
          error: () => this.errorSubject.next('Could not create credit card.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (card) => {
          subject.next(card);
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
      .delete<void>(`${this.creditCardsUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const current = this.cardsSubject.getValue();
            this.cardsSubject.next(current.filter((c) => c.id !== id));
          },
          error: () => this.errorSubject.next('Could not delete credit card.'),
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
