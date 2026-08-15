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

/**
 * `displayName` is REQUIRED (not defaulted) so every call site must be
 * explicit about what the backend actually sends. This matters because the
 * real contract differs by endpoint: `/auth/token` (login) sends the real
 * name, but `/auth/refresh` ALWAYS sends `displayName: null` — the backend's
 * `RefreshUseCase` deliberately omits the name claim on refresh (the client
 * already has it from the original login). A hardcoded default here (the
 * previous shape of this helper) let a refresh-response mock silently encode
 * a fictional contract, which is exactly how the CRITICAL "refresh blanks
 * the display name" bug slipped past this suite undetected.
 */
function tokenResponse(
  displayName: string | null,
  overrides: Partial<Omit<TokenResponse, 'displayName'>> = {},
): TokenResponse {
  return {
    accessToken: makeToken(Date.now() / 1000 + 3600),
    tokenType: 'Bearer',
    expiresIn: 3600,
    refreshToken: 'refresh-1',
    refreshExpiresIn: 86400,
    displayName,
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

    it('restores a real persisted display name from a valid stored session', () => {
      seedSession({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r',
        name: 'Jane Doe',
      });
      const service = createService();

      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      expect(user).not.toBeNull();
      expect(user!.name).toBe('Jane Doe');
    });

    it('deserializes a legacy StoredSession with no `name` property at all without crashing', () => {
      // Simulates a session written to localStorage before F-B1 added the
      // `name` field — the property is entirely absent from the parsed JSON,
      // not `null`. Must not crash and must not surface "undefined" as a name.
      const legacyRaw = JSON.stringify({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r',
      });
      localStorage.setItem(STORAGE_KEY, legacyRaw);

      let service!: AuthService;
      expect(() => (service = createService())).not.toThrow();

      expect(service.isAuthenticated()).toBe(true);

      let user: { name: string | null; initials: string } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      expect(user).not.toBeNull();
      expect(user!.name).toBeNull();
      expect(user!.initials).not.toBe('undefined');
      expect(user!.initials).toBe('J'); // falls back to the email's first letter
    });
  });

  describe('login', () => {
    it('stores the session and emits the user with the real backend displayName', () => {
      const service = createService();
      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.login('jane@mail.com', 'pw').subscribe();

      const req = httpMock.expectOne(`${AUTH_URL}/token`);
      expect(req.request.method).toBe('POST');
      req.flush(tokenResponse('Jane Doe'));

      expect(user).not.toBeNull();
      expect(user!.name).toBe('Jane Doe');
      expect(service.getToken()).not.toBeNull();

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(persisted.name).toBe('Jane Doe');
    });

    it('treats a `displayName: null` response as "no display name set", not a crash or "undefined"', () => {
      const service = createService();
      let user: { name: string | null; initials: string } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.login('jane@mail.com', 'pw').subscribe();

      httpMock.expectOne(`${AUTH_URL}/token`).flush(tokenResponse(null));

      expect(user).not.toBeNull();
      expect(user!.name).toBeNull();
      expect(user!.initials).toBe('J');

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(persisted.name).toBeNull();
    });

    it('treats a `displayName: ""` response identically to null', () => {
      const service = createService();
      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.login('jane@mail.com', 'pw').subscribe();

      httpMock.expectOne(`${AUTH_URL}/token`).flush(tokenResponse(''));

      expect(user!.name).toBeNull();
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
      expect(error?.message).toBe('Invalid email or password.');
    });

    it('maps a network failure (status 0) to an UNKNOWN AuthError', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.login('jane@mail.com', 'pw').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock.expectOne(`${AUTH_URL}/token`).error(new ProgressEvent('error'), { status: 0 });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
      expect(error?.message).toBe('Something went wrong. Please try again.');
    });
  });

  describe('register', () => {
    it('sends displayName in the request body and logs in on success (F-B2)', () => {
      const service = createService();
      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.register('jane@mail.com', 'pw', 'Jane Doe').subscribe();

      const registerReq = httpMock.expectOne(`${AUTH_URL}/register`);
      expect(registerReq.request.method).toBe('POST');
      expect(registerReq.request.body).toEqual({
        email: 'jane@mail.com',
        password: 'pw',
        displayName: 'Jane Doe',
      });
      registerReq.flush({ id: '1', email: 'jane@mail.com', createdAt: '2026-08-15T00:00:00Z' });

      const loginReq = httpMock.expectOne(`${AUTH_URL}/token`);
      loginReq.flush(tokenResponse('Jane Doe'));

      expect(user).not.toBeNull();
      expect(user!.name).toBe('Jane Doe');
    });

    it('propagates a typed AuthError when register itself fails (e.g. RATE_LIMITED)', () => {
      const service = createService();
      let error: AuthError | undefined;
      service.register('jane@mail.com', 'pw', 'Jane Doe').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${AUTH_URL}/register`)
        .flush(problemDetail({ status: 429, code: 'RATE_LIMITED' }), {
          status: 429,
          statusText: 'Too Many Requests',
        });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('RATE_LIMITED');
      httpMock.expectNone(`${AUTH_URL}/token`);
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

      // Real /auth/refresh contract: displayName is ALWAYS null on this endpoint.
      reqs[0].flush(tokenResponse(null, { accessToken: makeToken(Date.now() / 1000 + 7200) }));
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

    it('preserves the pre-existing displayName across a refresh, since /auth/refresh always sends displayName: null (review CRITICAL)', () => {
      // This is the REAL backend contract: RefreshUseCase deliberately omits the
      // name claim on /auth/refresh (TokenResponseDto: "always null on
      // /auth/refresh responses"). Treating that null as authoritative would
      // silently blank the user's real name on every automatic token refresh —
      // the exact bug this test guards against. The name must come from the
      // pre-existing session, NEVER from the refresh response.
      seedSession({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r-1',
        name: 'Jane Doe',
      });
      const service = createService();

      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.refreshAccessToken().subscribe();
      httpMock
        .expectOne(`${AUTH_URL}/refresh`)
        .flush(tokenResponse(null, { accessToken: makeToken(Date.now() / 1000 + 7200) }));

      expect(user).not.toBeNull();
      expect(user!.name).toBe('Jane Doe');

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(persisted.name).toBe('Jane Doe');
    });

    it('keeps the name null across a refresh when the pre-existing session had no name set', () => {
      seedSession({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r-1',
        name: null,
      });
      const service = createService();

      let user: { name: string | null; initials: string } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.refreshAccessToken().subscribe();
      httpMock
        .expectOne(`${AUTH_URL}/refresh`)
        .flush(tokenResponse(null, { accessToken: makeToken(Date.now() / 1000 + 7200) }));

      expect(user).not.toBeNull();
      expect(user!.name).toBeNull();
      expect(user!.initials).toBe('J');
    });
  });

  describe('updateProfile (F-B3)', () => {
    const USERS_URL = `${environment.apiUrl}/users`;

    it('sends the trimmed-by-caller displayName as the request body', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      service.updateProfile('New Name').subscribe();

      const req = httpMock.expectOne(`${USERS_URL}/me`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ displayName: 'New Name' });
      req.flush({ id: 'u-1', displayName: 'New Name' });
    });

    it('updates currentUserSubject (the same source the shell reads) with the fresh name on success', () => {
      seedSession({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r-1',
        name: 'Old Name',
      });
      const service = createService();

      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));
      expect(user!.name).toBe('Old Name');

      service.updateProfile('New Name').subscribe();
      httpMock.expectOne(`${USERS_URL}/me`).flush({ id: 'u-1', displayName: 'New Name' });

      expect(user!.name).toBe('New Name');
    });

    it('persists the fresh name to the stored session without touching the existing tokens', () => {
      seedSession({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r-1',
        name: 'Old Name',
      });
      const service = createService();

      service.updateProfile('New Name').subscribe();
      httpMock.expectOne(`${USERS_URL}/me`).flush({ id: 'u-1', displayName: 'New Name' });

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(persisted.name).toBe('New Name');
      expect(persisted.refreshToken).toBe('r-1');
    });

    it('does not touch currentUserSubject when the request fails', () => {
      seedSession({
        email: 'jane@mail.com',
        token: makeToken(Date.now() / 1000 + 3600),
        refreshToken: 'r-1',
        name: 'Old Name',
      });
      const service = createService();

      let user: { name: string | null } | null = null;
      service.currentUser$.subscribe((u) => (user = u));

      service.updateProfile('New Name').subscribe({ error: () => undefined });
      httpMock
        .expectOne(`${USERS_URL}/me`)
        .flush(problemDetail({ status: 400 }), { status: 400, statusText: 'Bad Request' });

      expect(user!.name).toBe('Old Name');
    });

    it('propagates a typed AuthError (not a raw HttpErrorResponse) on a 400 validation failure', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      let error: AuthError | undefined;
      service.updateProfile('N').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${USERS_URL}/me`)
        .flush(problemDetail({ status: 400, code: undefined }), { status: 400, statusText: 'Bad Request' });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
      expect(error?.message).toBe('Something went wrong. Please try again.');
    });

    it('propagates a typed AuthError on a 401 (interceptor territory in the real app, but the service must still type it)', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      let error: AuthError | undefined;
      service.updateProfile('New Name').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock
        .expectOne(`${USERS_URL}/me`)
        .flush(problemDetail({ status: 401, code: 'UNAUTHORIZED' }), { status: 401, statusText: 'Unauthorized' });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNAUTHORIZED');
    });

    it('propagates a typed AuthError on a 404 (account no longer exists) without crashing', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      let error: AuthError | undefined;
      expect(() => {
        service.updateProfile('New Name').subscribe({ error: (e: AuthError) => (error = e) });
        httpMock
          .expectOne(`${USERS_URL}/me`)
          .flush(problemDetail({ status: 404, code: undefined }), { status: 404, statusText: 'Not Found' });
      }).not.toThrow();

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
    });

    it('maps a network failure (status 0) to an UNKNOWN AuthError', () => {
      seedSession({ email: 'jane@mail.com', token: makeToken(Date.now() / 1000 + 3600), refreshToken: 'r-1' });
      const service = createService();

      let error: AuthError | undefined;
      service.updateProfile('New Name').subscribe({ error: (e: AuthError) => (error = e) });

      httpMock.expectOne(`${USERS_URL}/me`).error(new ProgressEvent('error'), { status: 0 });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNKNOWN');
    });

    it('errors with a typed AuthError and makes no HTTP call when there is no stored session', () => {
      const service = createService();

      let error: AuthError | undefined;
      service.updateProfile('New Name').subscribe({ error: (e: AuthError) => (error = e) });

      expect(error).toBeInstanceOf(AuthError);
      expect(error?.code).toBe<AuthErrorCode>('UNAUTHORIZED');
      httpMock.expectNone(`${USERS_URL}/me`);
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
