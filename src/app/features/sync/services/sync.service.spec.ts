import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PendingReview } from '@features/pending-review/models/pending-review';

import { SyncIngestResult, SyncReport } from '../models/sync';
import { SyncService } from './sync.service';

const SYNC_INGEST_URL = '/api/sync/ingest';

function makeReport(overrides: Partial<SyncReport> = {}): SyncReport {
  return { created: 5, skipped: 2, fallback: 1, errors: 0, ...overrides };
}

function makePendingReview(overrides: Partial<PendingReview> = {}): PendingReview {
  return {
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
    ...overrides,
  };
}

function makeIngestResult(overrides: Partial<SyncIngestResult> = {}): SyncIngestResult {
  return { report: makeReport(), pendingReviews: [makePendingReview()], ...overrides };
}

describe('SyncService', () => {
  let service: SyncService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SyncService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts to /sync/ingest with no body and returns the report + pending reviews envelope', () => {
    const ingestResult = makeIngestResult();
    let result: SyncIngestResult | undefined;

    service.ingest().subscribe((r) => (result = r));

    const req = httpMock.expectOne(SYNC_INGEST_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(ingestResult);

    expect(result).toEqual(ingestResult);
  });

  it('toggles syncing$ around the request', () => {
    const syncingStates: boolean[] = [];
    service.syncing$.subscribe((v) => syncingStates.push(v));

    service.ingest().subscribe();
    expect(syncingStates.at(-1)).toBe(true);

    httpMock.expectOne(SYNC_INGEST_URL).flush(makeIngestResult());
    expect(syncingStates.at(-1)).toBe(false);
  });

  it('sets error$ when the ingest call fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    service.ingest().subscribe({ error: () => undefined });
    httpMock.expectOne(SYNC_INGEST_URL).flush(null, { status: 500, statusText: 'Error' });

    expect(errors.at(-1)).toBe('Could not run sync.');
  });
});
