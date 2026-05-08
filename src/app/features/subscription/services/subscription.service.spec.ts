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
    };
    const updatedSubscription: Subscription = {
      ...subscription,
      description: input.description ?? subscription.description,
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
