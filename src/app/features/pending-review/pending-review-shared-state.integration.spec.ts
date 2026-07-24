import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmPendingReviewsResult, PendingReview } from './models/pending-review';
import { PendingReviewService } from './services/pending-review.service';
import { PendingReviewPage } from './pages/pending-review-page/pending-review-page';

const PENDING_REVIEWS_URL = '/api/pending-reviews';

/** Mirrors the protected-member access pattern from `pending-review-page.spec.ts` — a
 * single typed cast surface instead of repeating `as unknown as {...}` at each call site. */
interface PageInternals {
  items: () => readonly PendingReview[];
  onRename: (event: { id: string; value: string }) => void;
  onDiscard: (id: string) => void;
  onConfirmSelected: (ids: readonly string[]) => void;
}

function api(fixture: ComponentFixture<PendingReviewPage>): PageInternals {
  return fixture.componentInstance as unknown as PageInternals;
}

/**
 * Integration test for CA nº 8 of the handoff ("shared state between the modal and the
 * dedicated screen — an action in one reflects in the other without a manual refresh").
 *
 * Deliberately does NOT stub `PendingReviewService` (unlike `pending-review-page.spec.ts`,
 * which uses `FakePendingReviewService` to unit-test the page in isolation). Here the real
 * `providedIn: 'root'` service is resolved once from `TestBed` and shared by two separately
 * created `PendingReviewPage` fixtures — `route` and `modal` below stand in for the dedicated
 * route and the `MatDialog` instance (Task 4/Task 5), which both host the exact same page
 * component and receive the same singleton via DI, never their own copy.
 */
describe('PendingReview shared state (route <-> modal)', () => {
  let httpMock: HttpTestingController;
  let service: PendingReviewService;
  let route: ComponentFixture<PendingReviewPage>;
  let modal: ComponentFixture<PendingReviewPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PendingReviewPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(PendingReviewService);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  function openRoute(): void {
    route = TestBed.createComponent(PendingReviewPage);
    route.detectChanges();
  }

  function openModal(): void {
    modal = TestBed.createComponent(PendingReviewPage);
    modal.detectChanges();
  }

  function itemsIn(fixture: ComponentFixture<PendingReviewPage>): readonly PendingReview[] {
    return api(fixture).items();
  }

  it('opening a second view after sync already populated the service does not issue a redundant GET', () => {
    service.applySyncResult({
      report: { created: 2, skipped: 0, fallback: 0, errors: 0 },
      pendingReviews: [itemA, itemB],
    });

    openRoute();
    httpMock.expectNone(PENDING_REVIEWS_URL);
    expect(itemsIn(route)).toEqual([itemA, itemB]);

    openModal();
    httpMock.expectNone(PENDING_REVIEWS_URL);
    expect(itemsIn(modal)).toEqual([itemA, itemB]);
  });

  it('editing an item in the route reflects in the modal without a re-fetch', () => {
    service.applySyncResult({
      report: { created: 1, skipped: 0, fallback: 0, errors: 0 },
      pendingReviews: [itemA],
    });

    openRoute();
    openModal();

    api(route).onRename({ id: itemA.id, value: 'Renamed by route' });

    const patchRequest = httpMock.expectOne(`${PENDING_REVIEWS_URL}/${itemA.id}`);
    expect(patchRequest.request.method).toBe('PATCH');
    const renamed: PendingReview = { ...itemA, nameOverride: 'Renamed by route', resolvedName: 'Renamed by route' };
    patchRequest.flush(renamed);

    route.detectChanges();
    modal.detectChanges();

    expect(itemsIn(route)).toEqual([renamed]);
    expect(itemsIn(modal)).toEqual([renamed]);
    httpMock.expectNone(PENDING_REVIEWS_URL);
  });

  it('discarding an item in the modal removes it from the route view without a re-fetch', () => {
    service.applySyncResult({
      report: { created: 2, skipped: 0, fallback: 0, errors: 0 },
      pendingReviews: [itemA, itemB],
    });

    openRoute();
    openModal();

    api(modal).onDiscard(itemA.id);

    const deleteRequest = httpMock.expectOne(`${PENDING_REVIEWS_URL}/${itemA.id}`);
    expect(deleteRequest.request.method).toBe('DELETE');
    deleteRequest.flush(null);

    route.detectChanges();
    modal.detectChanges();

    expect(itemsIn(route)).toEqual([itemB]);
    expect(itemsIn(modal)).toEqual([itemB]);
    httpMock.expectNone(PENDING_REVIEWS_URL);
  });

  it('confirming an item in the route removes it from the modal view without a re-fetch', () => {
    service.applySyncResult({
      report: { created: 2, skipped: 0, fallback: 0, errors: 0 },
      pendingReviews: [itemA, itemB],
    });

    openRoute();
    openModal();

    api(route).onConfirmSelected([itemA.id]);

    const confirmRequest = httpMock.expectOne(`${PENDING_REVIEWS_URL}/confirm`);
    expect(confirmRequest.request.method).toBe('POST');
    expect(confirmRequest.request.body).toEqual({ ids: [itemA.id] });
    const result: ConfirmPendingReviewsResult = {
      confirmed: [{ pendingExpenseReviewId: itemA.id, expenseId: 'exp-1' }],
      failed: [],
    };
    confirmRequest.flush(result);

    route.detectChanges();
    modal.detectChanges();

    expect(itemsIn(route)).toEqual([itemB]);
    expect(itemsIn(modal)).toEqual([itemB]);
    httpMock.expectNone(PENDING_REVIEWS_URL);
  });

  it('end-to-end: sync -> open modal already populated -> confirm in modal -> route reflects removal, no GET at any point', () => {
    // 1. Sync populates the service directly (no GET involved, mirrors expense-page.syncNow()).
    service.applySyncResult({
      report: { created: 2, skipped: 0, fallback: 0, errors: 0 },
      pendingReviews: [itemA, itemB],
    });

    // 2. Route opens first (e.g. user navigated to /review-imports after the sync toast).
    openRoute();
    expect(itemsIn(route)).toEqual([itemA, itemB]);

    // 3. Modal opens on top of it (e.g. user re-triggers sync from the Expense page while
    //    already on the review route) — already shows the same items, no fetch.
    openModal();
    expect(itemsIn(modal)).toEqual([itemA, itemB]);
    httpMock.expectNone(PENDING_REVIEWS_URL);

    // 4. Confirm one item from the modal.
    api(modal).onConfirmSelected([itemA.id]);

    const confirmRequest = httpMock.expectOne(`${PENDING_REVIEWS_URL}/confirm`);
    confirmRequest.flush({
      confirmed: [{ pendingExpenseReviewId: itemA.id, expenseId: 'exp-1' }],
      failed: [],
    } satisfies ConfirmPendingReviewsResult);

    route.detectChanges();
    modal.detectChanges();

    // 5. The route instance, never touched directly, reflects the removal.
    expect(itemsIn(route)).toEqual([itemB]);
    expect(itemsIn(modal)).toEqual([itemB]);

    // No GET /pending-reviews ever happened across the whole flow.
    httpMock.expectNone(PENDING_REVIEWS_URL);
  });
});

const itemA: PendingReview = {
  id: 'pr-1',
  sourcePendingId: 'sp-1',
  bank: 'Nubank',
  cardLast4: '1234',
  cardLabel: 'Nubank final 1234',
  amount: 150.5,
  currency: 'BRL',
  merchant: 'Mercado',
  purchaseAt: '2026-07-20T12:00:00Z',
  nameOverride: null,
  resolvedName: 'Mercado',
  installmentNumber: null,
  status: 'PENDING_REVIEW',
};

const itemB: PendingReview = {
  ...itemA,
  id: 'pr-2',
  sourcePendingId: 'sp-2',
  merchant: 'Padaria',
  resolvedName: 'Padaria',
};
