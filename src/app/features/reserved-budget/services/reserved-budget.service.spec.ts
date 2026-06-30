import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  CreateReservedBudgetRequest,
  LinkReservedBudgetSourceRequest,
  PagedReservedBudgetResponse,
  ReservedBudget,
  UpdateReservedBudgetRequest,
} from '../models/reserved-budget';
import { ReservedBudgetService } from './reserved-budget.service';

describe('ReservedBudgetService', () => {
  let service: ReservedBudgetService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ReservedBudgetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // loadReservedBudgets() now lists via ?activeAt=<currentMonth> so consumed/remaining come populated.
  function expectActiveListRequest() {
    return httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/reserved-budgets' &&
        candidate.params.get('activeAt') === currentMonth(),
    );
  }

  it('should return reserved budgets via GET /api/reserved-budgets', () => {
    const response = pagedResponse([reservedBudget]);

    service.findAll().subscribe((result) => expect(result).toEqual(response));

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/reserved-budgets' &&
        candidate.params.get('page') === '0' &&
        candidate.params.get('size') === '100',
    );
    expect(request.request.method).toBe('GET');
    request.flush(response);
  });

  it('should request active reserved budgets for a month via activeAt param', () => {
    const response = pagedResponse([reservedBudget]);

    service.findActiveAt('2026-06').subscribe((result) => expect(result).toEqual(response));

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/reserved-budgets' &&
        candidate.params.get('activeAt') === '2026-06' &&
        candidate.params.get('page') === null &&
        candidate.params.get('size') === null,
    );
    expect(request.request.method).toBe('GET');
    request.flush(response);
  });

  it('should return a single reserved budget via GET /api/reserved-budgets/:id', () => {
    service.findById(reservedBudget.id).subscribe((result) => expect(result).toEqual(reservedBudget));

    const request = httpMock.expectOne('/api/reserved-budgets/reserved-budget-1');
    expect(request.request.method).toBe('GET');
    request.flush(reservedBudget);
  });

  it('should populate reservedBudgets$ with loadReservedBudgets API response', () => {
    const emitted: (readonly ReservedBudget[])[] = [];

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.loadReservedBudgets();

    const request = expectActiveListRequest();
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('activeAt')).toBe(currentMonth());
    request.flush(pagedResponse([reservedBudget]));

    expect(emitted.at(-1)).toEqual([reservedBudget]);
  });

  it('should list reserved budgets for the given activeAt month (wallet effectiveMonth)', () => {
    const walletMonth = '2026-03';

    service.loadReservedBudgets(walletMonth);

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/reserved-budgets' &&
        candidate.params.get('activeAt') === walletMonth,
    );
    expect(request.request.method).toBe('GET');
    request.flush(pagedResponse([reservedBudget]));
  });

  it('should reuse the last activeAt month for internal reloads (no explicit month)', () => {
    const walletMonth = '2026-02';

    // First load fixes the remembered month...
    service.loadReservedBudgets(walletMonth);
    httpMock
      .expectOne((c) => c.params.get('activeAt') === walletMonth)
      .flush(pagedResponse([reservedBudget]));

    // ...so a subsequent argument-less reload targets the same month, not the real-world now.
    service.loadReservedBudgets();
    const reload = httpMock.expectOne((c) => c.params.get('activeAt') === walletMonth);
    expect(reload.request.method).toBe('GET');
    reload.flush(pagedResponse([reservedBudget]));
  });

  it('should create a reserved budget and prepend it to reservedBudgets$', () => {
    const emitted: (readonly ReservedBudget[])[] = [];
    const input: CreateReservedBudgetRequest = {
      description: 'Rent',
      details: 'Apartment',
      budget: 2000,
      currency: 'BRL',
      effectiveMonth: '2026-06',
      flag: 'NONE',
    };
    const created: ReservedBudget = {
      ...reservedBudget,
      id: 'reserved-budget-2',
      description: input.description,
      details: input.details ?? null,
      startMonth: input.effectiveMonth,
      versions: [{ effectiveMonth: input.effectiveMonth, amount: input.budget }],
    };

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.create(input).subscribe((result) => expect(result).toEqual(created));

    const request = httpMock.expectOne('/api/reserved-budgets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(created);

    expect(emitted.at(-1)).toEqual([created]);
  });

  it('should update a reserved budget via PATCH and replace it in reservedBudgets$', () => {
    const emitted: (readonly ReservedBudget[])[] = [];
    const input: UpdateReservedBudgetRequest = {
      description: 'Rent (renegotiated)',
      details: 'Lower from August',
      newAmount: 1500,
      effectiveMonth: '2026-08',
    };
    const updated: ReservedBudget = {
      ...reservedBudget,
      description: input.description ?? reservedBudget.description,
      details: input.details ?? reservedBudget.details,
      versions: [
        ...reservedBudget.versions,
        { effectiveMonth: input.effectiveMonth ?? '', amount: input.newAmount ?? 0 },
      ],
    };

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.loadReservedBudgets();
    expectActiveListRequest().flush(pagedResponse([reservedBudget]));

    service.update(reservedBudget.id, input).subscribe((result) => expect(result).toEqual(updated));

    const request = httpMock.expectOne('/api/reserved-budgets/reserved-budget-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(input);
    request.flush(updated);

    expect(emitted.at(-1)).toEqual([updated]);
  });

  it('should send the PATCH body verbatim when effectiveMonth is omitted', () => {
    const input: UpdateReservedBudgetRequest = {
      description: 'Rent (renamed)',
      details: 'No amount change',
    };
    const updated: ReservedBudget = {
      ...reservedBudget,
      description: input.description ?? reservedBudget.description,
      details: input.details ?? reservedBudget.details,
    };

    service.update(reservedBudget.id, input).subscribe((result) => expect(result).toEqual(updated));

    const request = httpMock.expectOne('/api/reserved-budgets/reserved-budget-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(input);
    expect(request.request.body.effectiveMonth).toBeUndefined();
    request.flush(updated);
  });

  it('should link a source via POST /:id/links and replace the RB in reservedBudgets$', () => {
    const emitted: (readonly ReservedBudget[])[] = [];
    const input: LinkReservedBudgetSourceRequest = {
      sourceType: 'SUBSCRIPTION',
      sourceId: 'sub-1',
      fromMonth: '2026-06',
    };
    const linked: ReservedBudget = { ...reservedBudget, links: [input] };

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.loadReservedBudgets();
    expectActiveListRequest().flush(pagedResponse([reservedBudget]));

    service.link(reservedBudget.id, input).subscribe((result) => expect(result).toEqual(linked));

    const request = httpMock.expectOne('/api/reserved-budgets/reserved-budget-1/links');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(linked);

    expect(emitted.at(-1)).toEqual([linked]);
  });

  it('should unlink a source via DELETE /:id/links/:type/:sourceId and update the stream', () => {
    const emitted: (readonly ReservedBudget[])[] = [];
    const linked: ReservedBudget = {
      ...reservedBudget,
      links: [{ sourceType: 'SUBSCRIPTION', sourceId: 'sub-1', fromMonth: '2026-06' }],
    };
    const unlinked: ReservedBudget = { ...reservedBudget, links: [] };

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.loadReservedBudgets();
    expectActiveListRequest().flush(pagedResponse([linked]));

    service
      .unlink(reservedBudget.id, 'SUBSCRIPTION', 'sub-1')
      .subscribe((result) => expect(result).toEqual(unlinked));

    const request = httpMock.expectOne(
      '/api/reserved-budgets/reserved-budget-1/links/SUBSCRIPTION/sub-1',
    );
    expect(request.request.method).toBe('DELETE');
    request.flush(unlinked);

    expect(emitted.at(-1)).toEqual([unlinked]);
  });

  it('should expose an error message and clear linking state when linking fails', () => {
    const emittedErrors: (string | null)[] = [];
    const emittedLinkingIds: (string | null)[] = [];

    service.error$.subscribe((value) => emittedErrors.push(value));
    service.linking$.subscribe((value) => emittedLinkingIds.push(value));

    service
      .link(reservedBudget.id, { sourceType: 'INSTALLMENT', sourceId: 'inst-1', fromMonth: '2026-06' })
      .subscribe({ error: () => undefined });

    httpMock
      .expectOne('/api/reserved-budgets/reserved-budget-1/links')
      .flush(null, { status: 400, statusText: 'Bad Request' });

    expect(emittedErrors.at(-1)).toBe('Não foi possível vincular a fonte.');
    expect(emittedLinkingIds.at(-1)).toBeNull();
  });

  it('should keep consumedAmount/remainingAmount from the link response in the stream', () => {
    const emitted: (readonly ReservedBudget[])[] = [];
    const input: LinkReservedBudgetSourceRequest = {
      sourceType: 'SUBSCRIPTION',
      sourceId: 'sub-1',
      fromMonth: '2026-06',
    };
    const linked: ReservedBudget = {
      ...reservedBudget,
      links: [input],
      consumedAmount: 120,
      remainingAmount: 1880,
    };

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.loadReservedBudgets();
    expectActiveListRequest().flush(pagedResponse([reservedBudget]));

    service.link(reservedBudget.id, input).subscribe();

    httpMock.expectOne('/api/reserved-budgets/reserved-budget-1/links').flush(linked);

    expect(emitted.at(-1)?.[0].consumedAmount).toBe(120);
    expect(emitted.at(-1)?.[0].remainingAmount).toBe(1880);
  });

  it('should delete a reserved budget and remove it from reservedBudgets$', () => {
    const emitted: (readonly ReservedBudget[])[] = [];

    service.reservedBudgets$.subscribe((value) => emitted.push(value));
    service.loadReservedBudgets();
    expectActiveListRequest().flush(pagedResponse([reservedBudget]));

    service.delete(reservedBudget.id).subscribe();

    const request = httpMock.expectOne('/api/reserved-budgets/reserved-budget-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    expectActiveListRequest().flush(pagedResponse([]));

    expect(emitted.at(-1)).toEqual([]);
  });
});

const reservedBudget: ReservedBudget = {
  id: 'reserved-budget-1',
  description: 'Rent',
  details: 'Apartment',
  currency: 'BRL',
  startMonth: '2026-05',
  deleted: false,
  flag: 'NONE',
  versions: [{ effectiveMonth: '2026-05', amount: 2000 }],
  links: [],
};

function pagedResponse(content: readonly ReservedBudget[]): PagedReservedBudgetResponse {
  return {
    content,
    page: 0,
    size: content.length,
    totalElements: content.length,
    totalPages: 1,
  };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
