import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ConfirmPendingReviewsResult,
  PendingReview,
  SyncIngestResult,
} from '../models/pending-review';
import { PendingReviewService } from './pending-review.service';

const PENDING_REVIEWS_URL = '/api/pending-reviews';

describe('PendingReviewService', () => {
  let service: PendingReviewService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PendingReviewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  describe('loadAll', () => {
    it('populates pendingReviews$ and resets error$ via GET /api/pending-reviews', () => {
      const emitted: (readonly PendingReview[])[] = [];
      service.pendingReviews$.subscribe((value) => emitted.push(value));

      service.loadAll();

      const request = httpMock.expectOne(PENDING_REVIEWS_URL);
      expect(request.request.method).toBe('GET');
      request.flush([pendingReview]);

      expect(emitted.at(-1)).toEqual([pendingReview]);
    });

    it('sets error$ and keeps the previous array on network failure', () => {
      const errors: (string | null)[] = [];
      const emitted: (readonly PendingReview[])[] = [];

      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush([pendingReview]);

      service.pendingReviews$.subscribe((value) => emitted.push(value));
      service.error$.subscribe((value) => errors.push(value));

      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush(null, { status: 500, statusText: 'Error' });

      expect(errors.at(-1)).toBe('Não foi possível carregar as importações pendentes.');
      expect(emitted.at(-1)).toEqual([pendingReview]);
    });

    it('resets error$ back to null on a subsequent successful load', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush(null, { status: 500, statusText: 'Error' });
      expect(errors.at(-1)).toBe('Não foi possível carregar as importações pendentes.');

      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush([pendingReview]);

      expect(errors.at(-1)).toBeNull();
    });
  });

  describe('patch', () => {
    it('upserts the returned item locally without a re-fetch', () => {
      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush([pendingReview]);

      const updated: PendingReview = { ...pendingReview, nameOverride: 'Mercado X', resolvedName: 'Mercado X' };
      const emitted: (readonly PendingReview[])[] = [];
      service.pendingReviews$.subscribe((value) => emitted.push(value));

      service.patch(pendingReview.id, { nameOverride: 'Mercado X' }).subscribe((result) => {
        expect(result).toEqual(updated);
      });

      const request = httpMock.expectOne(`${PENDING_REVIEWS_URL}/${pendingReview.id}`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ nameOverride: 'Mercado X' });
      request.flush(updated);

      expect(emitted.at(-1)).toEqual([updated]);
    });

    it('sets error$ and propagates the error on failure', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      let errored = false;
      service.patch(pendingReview.id, { nameOverride: 'X' }).subscribe({ error: () => (errored = true) });

      httpMock
        .expectOne(`${PENDING_REVIEWS_URL}/${pendingReview.id}`)
        .flush(null, { status: 500, statusText: 'Error' });

      expect(errored).toBe(true);
      expect(errors.at(-1)).toBe('Não foi possível salvar a alteração.');
    });
  });

  describe('discard', () => {
    it('removes the item from the local array on success', () => {
      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush([pendingReview]);

      const emitted: (readonly PendingReview[])[] = [];
      service.pendingReviews$.subscribe((value) => emitted.push(value));

      service.discard(pendingReview.id).subscribe();

      const request = httpMock.expectOne(`${PENDING_REVIEWS_URL}/${pendingReview.id}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null);

      expect(emitted.at(-1)).toEqual([]);
    });

    it('sets error$ on failure', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.discard(pendingReview.id).subscribe({ error: () => undefined });

      httpMock
        .expectOne(`${PENDING_REVIEWS_URL}/${pendingReview.id}`)
        .flush(null, { status: 500, statusText: 'Error' });

      expect(errors.at(-1)).toBe('Não foi possível excluir o item.');
    });
  });

  describe('confirm', () => {
    it('removes confirmed items and keeps failed items in the local array', () => {
      const other: PendingReview = { ...pendingReview, id: 'pr-2', sourcePendingId: 'sp-2' };
      service.loadAll();
      httpMock.expectOne(PENDING_REVIEWS_URL).flush([pendingReview, other]);

      const emitted: (readonly PendingReview[])[] = [];
      service.pendingReviews$.subscribe((value) => emitted.push(value));

      const result: ConfirmPendingReviewsResult = {
        confirmed: [{ pendingExpenseReviewId: pendingReview.id, expenseId: 'expense-1' }],
        failed: [{ pendingExpenseReviewId: other.id, errorMessage: 'Item is not in PENDING_REVIEW' }],
      };

      let received: ConfirmPendingReviewsResult | undefined;
      service.confirm([pendingReview.id, other.id]).subscribe((r) => (received = r));

      const request = httpMock.expectOne(`${PENDING_REVIEWS_URL}/confirm`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ ids: [pendingReview.id, other.id] });
      request.flush(result);

      expect(received).toEqual(result);
      expect(emitted.at(-1)).toEqual([other]);
    });

    it('does not send a POST for an empty id list and resolves with an empty result', () => {
      let received: ConfirmPendingReviewsResult | undefined;
      service.confirm([]).subscribe((r) => (received = r));

      httpMock.expectNone(`${PENDING_REVIEWS_URL}/confirm`);
      expect(received).toEqual({ confirmed: [], failed: [] });
    });

    it('sets error$ on a real HTTP/network failure of the confirm request', () => {
      const errors: (string | null)[] = [];
      service.error$.subscribe((value) => errors.push(value));

      service.confirm([pendingReview.id]).subscribe({ error: () => undefined });

      httpMock.expectOne(`${PENDING_REVIEWS_URL}/confirm`).flush(null, { status: 500, statusText: 'Error' });

      expect(errors.at(-1)).toBe('Não foi possível confirmar as importações selecionadas.');
    });
  });

  describe('applySyncResult', () => {
    it('replaces the local array without an HTTP call', () => {
      const emitted: (readonly PendingReview[])[] = [];
      service.pendingReviews$.subscribe((value) => emitted.push(value));

      const syncResult: SyncIngestResult = {
        report: { created: 1, skipped: 0, fallback: 0, errors: 0 },
        pendingReviews: [pendingReview],
      };

      service.applySyncResult(syncResult);

      expect(emitted.at(-1)).toEqual([pendingReview]);
      httpMock.expectNone(PENDING_REVIEWS_URL);
    });
  });
});

const pendingReview: PendingReview = {
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
