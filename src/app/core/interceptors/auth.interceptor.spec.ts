import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';

import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: {
    getToken: ReturnType<typeof vi.fn>;
    refreshAccessToken: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    auth = { getToken: vi.fn(), refreshAccessToken: vi.fn() };
    navigate = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { navigate } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches a bearer token to protected requests', () => {
    auth.getToken.mockReturnValue('tok-1');

    http.get('/api/wallets').subscribe();

    const req = httpMock.expectOne('/api/wallets');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-1');
    req.flush([]);
  });

  it('does not attach a token to public auth paths', () => {
    auth.getToken.mockReturnValue('tok-1');

    http.post('/api/auth/token', {}).subscribe();

    const req = httpMock.expectOne('/api/auth/token');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(auth.getToken).not.toHaveBeenCalled();
    req.flush({});
  });

  it('redirects to /login when no token is present', () => {
    auth.getToken.mockReturnValue(null);

    http.get('/api/wallets').subscribe({ error: () => undefined });

    httpMock.expectNone('/api/wallets');
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('refreshes the token and retries the request on 401', () => {
    auth.getToken.mockReturnValue('stale');
    auth.refreshAccessToken.mockReturnValue(of('fresh'));

    let body: unknown;
    http.get('/api/wallets').subscribe((res) => (body = res));

    const first = httpMock.expectOne((r) => r.url === '/api/wallets' && r.headers.get('Authorization') === 'Bearer stale');
    first.flush(null, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne((r) => r.url === '/api/wallets' && r.headers.get('Authorization') === 'Bearer fresh');
    retry.flush([{ id: 'w-1' }]);

    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(body).toEqual([{ id: 'w-1' }]);
  });

  it('redirects to /login when the refresh fails', () => {
    auth.getToken.mockReturnValue('stale');
    auth.refreshAccessToken.mockReturnValue(throwError(() => new Error('expired')));

    http.get('/api/wallets').subscribe({ error: () => undefined });

    httpMock.expectOne('/api/wallets').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('passes through non-401 errors without refreshing', () => {
    auth.getToken.mockReturnValue('tok-1');

    let status = 0;
    http.get('/api/wallets').subscribe({ error: (e: { status: number }) => (status = e.status) });

    httpMock.expectOne('/api/wallets').flush(null, { status: 500, statusText: 'Server Error' });

    expect(status).toBe(500);
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });
});
