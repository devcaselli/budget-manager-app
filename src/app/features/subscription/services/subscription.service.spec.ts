import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  CreateSubscriptionRequest,
  PagedSubscriptionResponse,
  Subscription,
  UpdateSubscriptionRequest,
} from '../models/subscription';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SubscriptionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should return subscriptions via GET /api/subscriptions', () => {
    const response = pagedResponse([subscription]);

    service.findAll().subscribe((result) => expect(result).toEqual(response));

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/subscriptions' &&
        candidate.params.get('page') === '0' &&
        candidate.params.get('size') === '100',
    );
    expect(request.request.method).toBe('GET');
    request.flush(response);
  });

  it('should populate subscriptions$ with loadSubscriptions API response', () => {
    const emittedSubscriptions: (readonly Subscription[])[] = [];

    service.subscriptions$.subscribe((value) => emittedSubscriptions.push(value));
    service.loadSubscriptions();

    const request = httpMock.expectOne('/api/subscriptions?page=0&size=100');
    expect(request.request.method).toBe('GET');
    request.flush(pagedResponse([subscription]));

    expect(emittedSubscriptions.at(-1)).toEqual([subscription]);
  });

  it('should create a subscription and prepend it to subscriptions$', () => {
    const emittedSubscriptions: (readonly Subscription[])[] = [];
    const input: CreateSubscriptionRequest = {
      description: 'Music',
      amount: 29.9,
      currency: 'BRL',
      effectiveMonth: '2026-06',
      state: 'PREVIEW',
      flag: 'SUBSCRIPTION_DELETE_IGNORE_DATE_VALIDATION',
    };
    const createdSubscription: Subscription = {
      ...subscription,
      id: 'subscription-2',
      description: input.description,
      state: input.state ?? 'PRODUCTION',
      flag: input.flag ?? 'NONE',
      startMonth: input.effectiveMonth ?? subscription.startMonth,
      versions: [
        {
          effectiveMonth: input.effectiveMonth ?? subscription.startMonth,
          amount: input.amount,
        },
      ],
    };

    service.subscriptions$.subscribe((value) => emittedSubscriptions.push(value));
    service.create(input).subscribe((result) => expect(result).toEqual(createdSubscription));

    const request = httpMock.expectOne('/api/subscriptions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(createdSubscription);

    expect(emittedSubscriptions.at(-1)).toEqual([createdSubscription]);
  });

  it('should update a subscription via PATCH and replace it in subscriptions$', () => {
    const emittedSubscriptions: (readonly Subscription[])[] = [];
    const input: UpdateSubscriptionRequest = {
      description: 'Streaming Premium',
      newAmount: 69.9,
      creditCardId: 'card-2',
    };
    const updatedSubscription: Subscription = {
      ...subscription,
      description: input.description ?? subscription.description,
      creditCardId: input.creditCardId ?? subscription.creditCardId,
      versions: [
        ...subscription.versions,
        {
          effectiveMonth: '2026-06',
          amount: input.newAmount ?? 0,
        },
      ],
    };

    service.subscriptions$.subscribe((value) => emittedSubscriptions.push(value));
    service.loadSubscriptions();
    httpMock.expectOne('/api/subscriptions?page=0&size=100').flush(pagedResponse([subscription]));

    service
      .update(subscription.id, input)
      .subscribe((result) => expect(result).toEqual(updatedSubscription));

    const request = httpMock.expectOne('/api/subscriptions/subscription-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(input);
    request.flush(updatedSubscription);

    expect(emittedSubscriptions.at(-1)).toEqual([updatedSubscription]);
  });

  it('should forward effectiveMonth in the PATCH body when provided', () => {
    const input: UpdateSubscriptionRequest = {
      newAmount: 80,
      effectiveMonth: '2026-07',
    };

    service.loadSubscriptions();
    httpMock.expectOne('/api/subscriptions?page=0&size=100').flush(pagedResponse([subscription]));

    service.update(subscription.id, input).subscribe();

    const request = httpMock.expectOne('/api/subscriptions/subscription-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ newAmount: 80, effectiveMonth: '2026-07' });
    request.flush(subscription);
  });

  it('should PATCH only tagIds via assignTags', () => {
    let result: Subscription | undefined;
    service.assignTags(subscription.id, ['tag-1', 'tag-2']).subscribe((s) => (result = s));

    const request = httpMock.expectOne('/api/subscriptions/subscription-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ tagIds: ['tag-1', 'tag-2'] });

    const updated: Subscription = { ...subscription, tagIds: ['tag-1', 'tag-2'] };
    request.flush(updated);

    expect(result).toEqual(updated);
  });

  it('should send an empty array via assignTags to clear all tags', () => {
    service.assignTags(subscription.id, []).subscribe();

    const request = httpMock.expectOne('/api/subscriptions/subscription-1');
    expect(request.request.body).toEqual({ tagIds: [] });
    request.flush({ ...subscription, tagIds: [] });
  });

  it('should replace the subscription in subscriptions$ after assignTags resolves', () => {
    const emittedSubscriptions: (readonly Subscription[])[] = [];

    service.subscriptions$.subscribe((value) => emittedSubscriptions.push(value));
    service.loadSubscriptions();
    httpMock.expectOne('/api/subscriptions?page=0&size=100').flush(pagedResponse([subscription]));

    const updated: Subscription = { ...subscription, tagIds: ['tag-1'] };
    service.assignTags(subscription.id, ['tag-1']).subscribe();
    httpMock.expectOne('/api/subscriptions/subscription-1').flush(updated);

    expect(emittedSubscriptions.at(-1)).toEqual([updated]);
  });

  it('should surface a tag-specific error message when assignTags fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    let errored = false;
    service.assignTags(subscription.id, ['tag-1']).subscribe({ error: () => (errored = true) });

    httpMock
      .expectOne('/api/subscriptions/subscription-1')
      .flush(null, { status: 500, statusText: 'Error' });

    expect(errored).toBe(true);
    expect(errors.at(-1)).toBe(
      'Subscription salva, mas não foi possível aplicar as tags. Tente novamente pela row.',
    );
  });

  it('should delete a subscription and remove it from subscriptions$', () => {
    const emittedSubscriptions: (readonly Subscription[])[] = [];

    service.subscriptions$.subscribe((value) => emittedSubscriptions.push(value));
    service.loadSubscriptions();
    httpMock.expectOne('/api/subscriptions?page=0&size=100').flush(pagedResponse([subscription]));

    service.delete(subscription.id).subscribe();

    const request = httpMock.expectOne('/api/subscriptions/subscription-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    httpMock.expectOne('/api/subscriptions?page=0&size=100').flush(pagedResponse([]));

    expect(emittedSubscriptions.at(-1)).toEqual([]);
  });
});

const subscription: Subscription = {
  id: 'subscription-1',
  description: 'Streaming',
  currency: 'BRL',
  state: 'PRODUCTION',
  flag: 'NONE',
  startMonth: '2026-05',
  endMonth: null,
  creditCardId: null,
  versions: [
    {
      effectiveMonth: '2026-05',
      amount: 59.9,
    },
  ],
};

function pagedResponse(content: readonly Subscription[]): PagedSubscriptionResponse {
  return {
    content,
    page: 0,
    size: 100,
    totalElements: content.length,
    totalPages: 1,
  };
}
