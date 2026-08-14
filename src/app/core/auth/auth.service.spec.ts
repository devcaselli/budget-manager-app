import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '@environments/environment';

import { AuthService } from './auth.service';
import { AuthError, AuthErrorCode, ProblemDetailBody, StoredSession, TokenResponse } from './auth.model';

const STORAGE_KEY = 'bm_session';
const AUTH_URL = `${environment.apiUrl}/auth`;

/** Build a JWT-shaped token whose payload carries the given exp (seconds). */
function makeToken(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function tokenResponse(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return {
    accessToken: makeToken(Date.now() / 1000 + 3600),
    tokenType: 'Bearer',
    expiresIn: 3600,
    refreshToken: 'refresh-1',
    refreshExpiresIn: 86400,
    ...overrides,
  };
}

function seedSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/** Build a realistic RFC 7807 `ProblemDetail` body with the `code` extension property. */
function problemDetail(overrides: Partial<ProblemDetailBody> = {}): ProblemDetailBody {
  return {
    type: 'about:blank',
    title: 'Error',
    status: 400,
    detail: 'Something went wrong.',
    instance: '/auth/token',
    correlationId: 'corr-1',
    ...overrides,
  };
}

/** Minimal in-memory localStorage — the test env does not provide one. */
function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  const stub: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', stub);
}

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createService(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    return service;
  }

  describe('session restore on construction', () => {
    it('restores a user from a valid stored token', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r' });
      const service = createService();
      expect(service.isAuthenticated()).toBe(true);
    });

    it('clears an expired stored token', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 - 10), refreshToken: 'r' });
      const service = createService();
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('treats a token within the skew window as expired', () => {
      // exp 10s in the future, but the 30s skew margin makes it already expired.
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 10), refreshToken: 'r' });
      const service = createService();
      expect(service.hasValidSession()).toBe(false);
    });
  });

  describe('login', () => {
    it('stores the session and emits the derived user', () => {
      const service = createService();
      let authed = false;
      service.currentUser$.subscribe((u) => (authed = u !== null));

      service.login('jane@mail.com', 'pw').subscribe();

      const req = httpMock.expectOne(`${AUTH_URL}/token`);
      expect(req.request.method).toBe('POST');
      req.flush(tokenResponse());

      expect(authed).toBe(true);
      expect(service.getToken()).not.toBeNull();
    });

    it('maps a 401 INVALID_CREDENTIALS response to a typed AuthError', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'bad').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/token`)
        .flush(problemDetail({ status: 401, code: 'INVALID_CREDENTIALS' }), {
          status: 401,
          statusText: 'Unauthorized',
        });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('INVALID_CREDENTIALS');
      expect(error?.message).toBe('Email ou senha inválidos.');
    });

    it('maps a network failure (status 0) to an UNKNOWN AuthError', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'pw').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock.expectOne(`${AUTH_URL}/token`).error(new ProgressEvent('error'), { status: 0 });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
      expect(error?.message).toBe('Ocorreu um erro. Tente novamente.');
    });
  });

  describe('AuthErrorCode parsing (mapHttpError)', () => {
    it('parses INVALID_OR_EXPIRED_TOKEN from a 400 ProblemDetail', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'bad').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/token`)
        .flush(problemDetail({ status: 400, code: 'INVALID_OR_EXPIRED_TOKEN' }), {
          status: 400,
          statusText: 'Bad Request',
        });

      expect(error?.code).toBe<AuthErrorCode>('INVALID_OR_EXPIRED_TOKEN');
    });

    it('parses UNAUTHORIZED from a 401 ProblemDetail distinct from INVALID_CREDENTIALS', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'bad').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/token`)
        .flush(problemDetail({ status: 401, code: 'UNAUTHORIZED' }), {
          status: 401,
          statusText: 'Unauthorized',
        });

      expect(error?.code).toBe<AuthErrorCode>('UNAUTHORIZED');
    });

    it('parses RATE_LIMITED from a 429 ProblemDetail', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'bad').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/token`)
        .flush(problemDetail({ status: 429, code: 'RATE_LIMITED' }), {
          status: 429,
          statusText: 'Too Many Requests',
        });

      expect(error?.code).toBe<AuthErrorCode>('RATE_LIMITED');
    });

    it('falls back to UNKNOWN when the response has no code property', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'bad').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/token`)
        .flush(problemDetail({ status: 500, code: undefined }), {
          status: 500,
          statusText: 'Internal Server Error',
        });

      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
    });

    it('falls back to UNKNOWN when the code string is not in the known union', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'bad').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/token`)
        .flush(problemDetail({ status: 418, code: 'SOME_FUTURE_CODE_THIS_BUILD_DOES_NOT_KNOW' }), {
          status: 418,
          statusText: "I'm a teapot",
        });

      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
    });
  });

  describe('refreshAccessToken', () => {
    it('dedupes concurrent callers into a single /refresh request', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      const tokens: string[] = [];
      service.refreshAccessToken().subscribe((t) => tokens.push(t));
      service.refreshAccessToken().subscribe((t) => tokens.push(t));

      const reqs = httpMock.match(`${AUTH_URL}/refresh`);
      expect(reqs).toHaveLength(1);

      reqs[0].flush(tokenResponse({ accessToken: makeToken(Date.now() / 1000 + 7200) }));
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toBe(tokens[1]);
    });

    it('logs out and errors when no refresh token is stored', () => {
      const service = createService();
      let errored = false;
      service.refreshAccessToken().subscribe({ error: () => (errored = true) });

      expect(errored).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
      httpMock.expectNone(`${AUTH_URL}/refresh`);
    });

    it('logs out when the refresh request fails', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      service.refreshAccessToken().subscribe({ error: () => undefined });
      httpMock.expectOne(`${AUTH_URL}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the stored session and the current user', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r' });
      const service = createService();

      service.logout();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getToken()).toBeNull();
    });
  });
});
