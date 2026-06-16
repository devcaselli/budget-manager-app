import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { apiErrorInterceptor } from './api-error.interceptor';

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('retries once on a network error (status 0) and succeeds', () => {
    vi.useFakeTimers();

    let body: unknown;
    http.get('/api/wallets').subscribe((res) => (body = res));

    httpMock.expectOne('/api/wallets').error(new ProgressEvent('error'), { status: 0 });

    // Retry is delayed by timer(250) — advance past it.
    vi.advanceTimersByTime(250);

    httpMock.expectOne('/api/wallets').flush([{ id: 'w-1' }]);
    expect(body).toEqual([{ id: 'w-1' }]);
  });

  it('does not retry on a non-network error', () => {
    let status = 0;
    http.get('/api/wallets').subscribe({ error: (e: { status: number }) => (status = e.status) });

    httpMock.expectOne('/api/wallets').flush(null, { status: 500, statusText: 'Server Error' });

    httpMock.expectNone('/api/wallets');
    expect(status).toBe(500);
  });
});
