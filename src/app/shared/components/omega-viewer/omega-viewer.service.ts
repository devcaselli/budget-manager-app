import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

import { environment } from '@environments/environment';
import { Expense } from '@features/expense/models/expense';
import { Installment } from '@features/installment/models/installment';
import { Subscription } from '@features/subscription/models/subscription';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerSubscriptionDetail,
} from './models/omega-viewer-detail';
import { OmegaViewerLink, OmegaViewerRef } from './models/omega-viewer-ref';

/**
 * Read facade for the Omega Viewer shell. `load()` is the only public surface —
 * everything below it (this whole file) is a client-side fallback that composes the
 * detail from `ExpenseService`/`InstallmentService`/`SubscriptionService`'s per-id REST
 * shape via direct `HttpClient` calls, because the real backend viewer read endpoints
 * (GET /viewer/expenses/{id} etc., backend tasks C4/C5/C6) don't exist yet.
 *
 * `payerName` is always `null` here — resolving it needs the backend's
 * Payment->Share->quota chain, which has no client-side equivalent (no aggregate carries
 * a payerId directly; see the Omega Viewer README, "Achados que mudam o escopo" #4).
 *
 * DTO->domain mapping and `links` derivation (Expense.installmentId <-> link,
 * Installment.sourceExpenseId <-> link) live entirely in the `mapXxx` private methods
 * below. The raw backend shape never reaches the component. When the real endpoint ships,
 * only this file changes — swap the bodies of the three `loadXxx` methods for a single
 * `http.get<ViewerResponseDto>` call and keep `load()`'s signature untouched.
 *
 * Component-scoped provider (see `OmegaViewerComponent`'s `providers: []`) — this is
 * modal view-state, not an app-lifetime singleton, so it is NOT `providedIn: 'root'`.
 */
@Injectable()
export class OmegaViewerService {
  private readonly http = inject(HttpClient);
  private readonly expensesUrl = `${environment.apiUrl}/expenses`;
  private readonly installmentsUrl = `${environment.apiUrl}/installments`;
  private readonly subscriptionsUrl = `${environment.apiUrl}/subscriptions`;

  load(ref: OmegaViewerRef): Observable<OmegaViewerDetail> {
    switch (ref.kind) {
      case 'EXPENSE':
        return this.loadExpense(ref.id);
      case 'INSTALLMENT':
        return this.loadInstallment(ref.id);
      case 'SUBSCRIPTION':
        return this.loadSubscription(ref.id);
    }
  }

  private loadExpense(id: string): Observable<OmegaViewerExpenseDetail> {
    return this.http.get<Expense>(`${this.expensesUrl}/${id}`).pipe(
      switchMap((expense) =>
        this.fetchInstallmentById(expense.installmentId ?? null).pipe(
          map((linkedInstallment) => this.mapExpense(expense, linkedInstallment)),
        ),
      ),
    );
  }

  private loadInstallment(id: string): Observable<OmegaViewerInstallmentDetail> {
    return this.http
      .get<Installment>(`${this.installmentsUrl}/${id}`)
      .pipe(map((installment) => this.mapInstallment(installment)));
  }

  private loadSubscription(id: string): Observable<OmegaViewerSubscriptionDetail> {
    return this.http
      .get<Subscription>(`${this.subscriptionsUrl}/${id}`)
      .pipe(map((subscription) => this.mapSubscription(subscription)));
  }

  /**
   * Best-effort lookup of a linked Installment by id, used only to derive
   * `links`/`installmentsRemaining` on the Expense detail. Swallows a missing/failed
   * fetch to `null` rather than failing the whole viewer load over a cross-reference —
   * the Expense itself is still fully viewable without its linked Installment.
   */
  private fetchInstallmentById(installmentId: string | null): Observable<Installment | null> {
    if (!installmentId) {
      return of(null);
    }
    return this.http
      .get<Installment>(`${this.installmentsUrl}/${installmentId}`)
      .pipe(catchError(() => of(null)));
  }

  private mapExpense(expense: Expense, linkedInstallment: Installment | null): OmegaViewerExpenseDetail {
    const links: OmegaViewerLink[] = [];
    if (expense.installmentId) {
      links.push({
        ref: { kind: 'INSTALLMENT', id: expense.installmentId },
        label: linkedInstallment?.description ?? 'Parcela vinculada',
      });
    }

    return {
      kind: 'EXPENSE',
      ref: { kind: 'EXPENSE', id: expense.id },
      name: expense.name,
      cost: expense.cost,
      remaining: expense.remaining,
      purchaseDate: expense.purchaseDate,
      creditCardId: expense.creditCardId ?? null,
      details: null,
      tagIds: expense.tagIds ?? [],
      payerName: null,
      payments: [],
      // 0 (fully paid) and null (not an installment) must never collapse together.
      installmentsRemaining:
        linkedInstallment !== null ? this.installmentsRemainingOf(linkedInstallment) : null,
      links,
      audit: null,
    };
  }

  private mapInstallment(installment: Installment): OmegaViewerInstallmentDetail {
    const links: OmegaViewerLink[] = [];
    if (installment.sourceExpenseId) {
      links.push({
        ref: { kind: 'EXPENSE', id: installment.sourceExpenseId },
        label: installment.description,
      });
    }

    return {
      kind: 'INSTALLMENT',
      ref: { kind: 'INSTALLMENT', id: installment.id },
      description: installment.description,
      originalValue: installment.originalValue,
      installmentValue: installment.installmentValue,
      installmentNumber: installment.installmentNumber,
      purchaseDate: installment.purchaseDate,
      lastInstallmentDate: installment.lastInstallmentDate,
      creditCardId: installment.creditCardId,
      details: installment.details ?? null,
      tagIds: installment.tagIds ?? [],
      payerName: null,
      links,
      audit: null,
    };
  }

  private mapSubscription(subscription: Subscription): OmegaViewerSubscriptionDetail {
    return {
      kind: 'SUBSCRIPTION',
      ref: { kind: 'SUBSCRIPTION', id: subscription.id },
      description: subscription.description,
      currency: subscription.currency,
      state: subscription.state === 'PREVIEW' ? 'PREVIEW' : 'PRODUCTION',
      startMonth: subscription.startMonth,
      endMonth: subscription.endMonth,
      creditCardId: subscription.creditCardId,
      details: null,
      tagIds: subscription.tagIds ?? [],
      payerName: null,
      // Subscription has no Payment/Expense link — confirmed expected, README decisions table.
      links: [],
      audit: null,
    };
  }

  /**
   * `installmentsRemaining` derivation: the backend's `InstallmentProgressCalculator`
   * (task C3) doesn't exist client-side, so this fallback returns `installmentNumber`
   * (total charge count) as a conservative placeholder rather than a computed
   * "charges paid so far", which would need payment history this service doesn't fetch.
   * Documented here deliberately: swapping to the real endpoint replaces this whole
   * method, not just a tweak.
   */
  private installmentsRemainingOf(installment: Installment): number {
    return installment.installmentNumber;
  }
}
