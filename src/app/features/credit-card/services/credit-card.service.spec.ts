import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CreditCard, EMPTY_CREDIT_CARD_CHARGES } from '../models/credit-card';
import { CreditCardService } from './credit-card.service';

const CARDS_URL = '/api/credit-cards';

function makeCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return { id: 'card-1', name: 'Nubank', ...overrides };
}

describe('CreditCardService', () => {
  let service: CreditCardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CreditCardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads paged cards into cards$', () => {
    const cards = [makeCard()];
    const emitted: (readonly CreditCard[])[] = [];
    service.cards$.subscribe((v) => emitted.push(v));

    service.loadAll();

    const req = httpMock.expectOne((r) => r.url === CARDS_URL);
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('100');
    req.flush({ content: cards, totalElements: 1, totalPages: 1, page: 0, size: 100 });

    expect(emitted.at(-1)).toEqual(cards);
  });

  it('sets error$ when loading cards fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    service.loadAll();
    httpMock.expectOne((r) => r.url === CARDS_URL).flush(null, { status: 500, statusText: 'Error' });

    expect(errors.at(-1)).toBe('Could not load credit cards.');
  });

  it('loads charges with an effectiveMonth param', () => {
    const charges = { ...EMPTY_CREDIT_CARD_CHARGES, totalCost: 200 };
    const emitted: typeof charges[] = [];
    service.charges$.subscribe((v) => emitted.push(v));

    service.loadCharges({ creditCardId: 'card-1', effectiveMonth: '2026-05' });

    const req = httpMock.expectOne((r) => r.url === `${CARDS_URL}/card-1/charges`);
    expect(req.request.params.get('effectiveMonth')).toBe('2026-05');
    req.flush(charges);

    expect(emitted.at(-1)).toEqual(charges);
  });

  it('resets charges to empty when charges loading fails', () => {
    const emitted: unknown[] = [];
    service.charges$.subscribe((v) => emitted.push(v));

    service.loadCharges({ creditCardId: 'card-1' });
    httpMock.expectOne(`${CARDS_URL}/card-1/charges`).flush(null, { status: 500, statusText: 'Error' });

    expect(emitted.at(-1)).toEqual(EMPTY_CREDIT_CARD_CHARGES);
  });

  it('appends a created card to cards$', () => {
    service.loadAll();
    httpMock
      .expectOne((r) => r.url === CARDS_URL)
      .flush({ content: [makeCard({ id: 'card-1' })], totalElements: 1, totalPages: 1, page: 0, size: 100 });

    const created = makeCard({ id: 'card-2', name: 'Itau' });
    const emitted: (readonly CreditCard[])[] = [];
    service.cards$.subscribe((v) => emitted.push(v));

    let result: CreditCard | undefined;
    service.create({ name: 'Itau' }).subscribe((c) => (result = c));

    const req = httpMock.expectOne(CARDS_URL);
    expect(req.request.method).toBe('POST');
    req.flush(created);

    expect(result).toEqual(created);
    expect(emitted.at(-1)).toEqual([makeCard({ id: 'card-1' }), created]);
  });

  it('removes a deleted card from cards$', () => {
    const a = makeCard({ id: 'card-1' });
    const b = makeCard({ id: 'card-2' });
    service.loadAll();
    httpMock
      .expectOne((r) => r.url === CARDS_URL)
      .flush({ content: [a, b], totalElements: 2, totalPages: 1, page: 0, size: 100 });

    const emitted: (readonly CreditCard[])[] = [];
    service.cards$.subscribe((v) => emitted.push(v));

    service.delete('card-1').subscribe();
    httpMock.expectOne(`${CARDS_URL}/card-1`).flush(null);

    expect(emitted.at(-1)).toEqual([b]);
  });
});
