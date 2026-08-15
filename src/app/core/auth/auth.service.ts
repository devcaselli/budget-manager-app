import { computed, inject, Injectable, Signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  catchError,
  finalize,
  map,
  Observable,
  shareReplay,
  switchMap,
  throwError,
} from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { environment } from '@environments/environment';
import { assertNever } from '@shared/utils/assert-never';
import { deriveInitials } from '@shared/utils/derive-initials';
import {
  AuthError,
  AuthErrorCode,
  AuthUser,
  LoginRequest,
  ProblemDetailBody,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  StoredSession,
  TokenResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from './auth.model';

const STORAGE_KEY_SESSION = 'bm_session';

/** Treat a token as expired this many seconds early to absorb clock skew. */
const TOKEN_EXPIRY_SKEW_SECONDS = 30;

/**
 * Builds an `AuthUser` from real backend data only — `name` is whatever the
 * backend's `TokenResponse.displayName` said (including `null`), never a
 * fabricated value. Replaces the old `deriveUser()`, which faked a display
 * name from the email's local-part; that fabrication is gone (F-B1).
 *
 * Initials are derived via the shared, grapheme-aware `deriveInitials()`
 * (`shared/utils/derive-initials.ts`, F-B4) — robust to compound names,
 * emoji/combining-mark grapheme clusters, and the empty/no-name state,
 * falling back to the account email when there is no display name on file.
 */
function toAuthUser(email: string, name: string | null): AuthUser {
  const normalizedName = name && name.trim().length > 0 ? name : null;
  return { email, name: normalizedName, initials: deriveInitials(normalizedName, email) };
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY_SESSION);
}

/** Decode JWT payload and return exp timestamp (seconds). Returns 0 on error. */
function getTokenExp(token: string): number {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp : 0;
  } catch {
    return 0;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = getTokenExp(token);
  if (exp === 0) return true;
  return Date.now() / 1000 >= exp - TOKEN_EXPIRY_SKEW_SECONDS;
}

const KNOWN_AUTH_ERROR_CODES: ReadonlySet<AuthErrorCode> = new Set<AuthErrorCode>([
  'INVALID_CREDENTIALS',
  'INVALID_OR_EXPIRED_TOKEN',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'EMAIL_EXISTS',
  'EMAIL_NOT_CONFIRMED',
  'OTP_REQUIRED',
  'OTP_INVALID',
]);

function isKnownAuthErrorCode(code: string | undefined): code is AuthErrorCode {
  return code != null && KNOWN_AUTH_ERROR_CODES.has(code as AuthErrorCode);
}

/**
 * Parses the real `code` extension property off a `ProblemDetail` error body.
 * Falls back to `UNKNOWN` — never crashes, never guesses from status/text — for
 * a network-level error (no body), a malformed body, or a `code` string this
 * frontend build doesn't recognize yet (forward-compat with future backend codes).
 */
function parseAuthErrorCode(error: HttpErrorResponse): AuthErrorCode {
  if (error.status === 0) {
    return 'UNKNOWN';
  }
  const code = (error.error as ProblemDetailBody | null)?.code;
  return isKnownAuthErrorCode(code) ? code : 'UNKNOWN';
}

/**
 * Human-readable message per code, used only for direct display (e.g. a
 * template binding to `err.message`). No consumer may branch on this text —
 * branch on `AuthError.code` instead. This exhaustive switch is intentionally
 * message-only; it is not F-A2's copy-standardization pass (separate task).
 */
function messageForAuthErrorCode(code: AuthErrorCode): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password.';
    case 'INVALID_OR_EXPIRED_TOKEN':
      return 'Invalid or expired link or code.';
    case 'UNAUTHORIZED':
      return 'Session expired.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Please try again later.';
    case 'EMAIL_EXISTS':
      return 'An account with this email already exists.';
    case 'EMAIL_NOT_CONFIRMED':
      return 'Email not confirmed yet.';
    case 'OTP_REQUIRED':
      return 'Verification code required.';
    case 'OTP_INVALID':
      return 'Invalid verification code.';
    case 'UNKNOWN':
      return 'Something went wrong. Please try again.';
    default:
      return assertNever(code);
  }
}

function mapHttpError(error: HttpErrorResponse): Observable<never> {
  const code = parseAuthErrorCode(error);
  return throwError(() => new AuthError(code, messageForAuthErrorCode(code)));
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authUrl = `${environment.apiUrl}/auth`;
  private readonly usersUrl = `${environment.apiUrl}/users`;

  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  private readonly currentUserSignal: Signal<AuthUser | null | undefined> = toSignal(
    this.currentUser$,
  );

  readonly isAuthenticated = computed(() => this.currentUserSignal() != null);

  /** Shared single-flight refresh, deduping concurrent 401-driven callers. */
  private refreshInFlight$: Observable<string> | null = null;

  constructor() {
    const session = readSession();
    if (session) {
      if (isTokenExpired(session.token)) {
        clearSession();
      } else {
        // `session.name` is `undefined` for a legacy StoredSession blob written
        // before this field existed (absent from the parsed JSON, not `null`) —
        // normalize both to `null` here so a stale localStorage shape can never
        // crash or leak an `undefined`/"undefined" name into the UI.
        this.currentUserSubject.next(toAuthUser(session.email, session.name ?? null));
      }
    }
  }

  getToken(): string | null {
    const session = readSession();
    return session?.token ?? null;
  }

  /** Returns true if stored token exists and is not expired. */
  hasValidSession(): boolean {
    const session = readSession();
    if (!session) return false;
    return !isTokenExpired(session.token);
  }

  login(email: string, password: string): Observable<void> {
    const body: LoginRequest = { email, password };

    return this.http.post<TokenResponse>(`${this.authUrl}/token`, body).pipe(
      map((response) => {
        const name = response.displayName ?? null;
        writeSession({
          email,
          token: response.accessToken,
          refreshToken: response.refreshToken,
          name,
        });
        this.currentUserSubject.next(toAuthUser(email, name));
      }),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  /**
   * Exchanges the stored (rotated, single-use) refresh token for a new token
   * pair. Concurrent callers share one in-flight request via shareReplay so a
   * burst of 401s triggers a single /auth/refresh call.
   *
   * IMPORTANT — `displayName` on this response is ALWAYS `null`: the backend's
   * `RefreshUseCase` deliberately omits the name claim/field on `/auth/refresh`
   * (`TokenResponseDto`'s own contract states it's "always null on /auth/refresh
   * responses" — the client already has the real name from the original
   * `/auth/token` login response). Treating that `null` as authoritative here
   * would silently blank the user's real display name on every automatic,
   * user-invisible token refresh (triggered by `auth.interceptor.ts` on any
   * 401). So — unlike `login()` and `updateProfile()`, where a `displayName`
   * value (including a genuine `null` for "no name set") IS authoritative and
   * must overwrite — this path treats `null` as "unchanged" and preserves
   * whatever name the pre-refresh session already had.
   */
  refreshAccessToken(): Observable<string> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    const session = readSession();
    if (!session?.refreshToken) {
      this.logout();
      return throwError(() => new AuthError('UNAUTHORIZED', messageForAuthErrorCode('UNAUTHORIZED')));
    }

    const body: RefreshRequest = { refreshToken: session.refreshToken };

    this.refreshInFlight$ = this.http
      .post<TokenResponse>(`${this.authUrl}/refresh`, body)
      .pipe(
        map((response) => {
          // See the method doc above — `response.displayName` is never a real
          // value on this endpoint, so a `null` here means "unchanged," not
          // "authoritative." Fall back to the session's existing name.
          const name = response.displayName ?? session.name ?? null;
          writeSession({
            email: session.email,
            token: response.accessToken,
            refreshToken: response.refreshToken,
            name,
          });
          this.currentUserSubject.next(toAuthUser(session.email, name));
          return response.accessToken;
        }),
        catchError((error: HttpErrorResponse) => {
          this.logout();
          return mapHttpError(error);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    return this.refreshInFlight$;
  }

  register(email: string, password: string, displayName: string): Observable<void> {
    const body: RegisterRequest = { email, password, displayName };

    return this.http.post<RegisterResponse>(`${this.authUrl}/register`, body).pipe(
      switchMap(() => this.login(email, password)),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  /**
   * `PATCH /users/me` (F-B3). Updates the account's display name and, on
   * success, pushes the fresh name into `currentUserSubject` — the same
   * reactive source the shell reads for its name/initials chip — so the UI
   * updates immediately, with no reload or re-login. Also rewrites the
   * persisted `StoredSession.name` (mirroring `refreshAccessToken`'s own
   * write-session-then-notify pattern) so a page reload doesn't show a stale
   * name before the next token refresh.
   *
   * The backend trims server-side before validation, so `displayName` is not
   * trimmed here before the request — the caller may trim for its own UX
   * (e.g. to preview what will be persisted), but this method sends whatever
   * it is given.
   */
  updateProfile(displayName: string): Observable<void> {
    const session = readSession();
    if (!session) {
      return throwError(() => new AuthError('UNAUTHORIZED', messageForAuthErrorCode('UNAUTHORIZED')));
    }

    const body: UpdateProfileRequest = { displayName };

    return this.http.patch<UpdateProfileResponse>(`${this.usersUrl}/me`, body).pipe(
      map((response) => {
        const name = response.displayName ?? null;
        writeSession({
          email: session.email,
          token: session.token,
          refreshToken: session.refreshToken,
          name,
        });
        this.currentUserSubject.next(toAuthUser(session.email, name));
      }),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  logout(): void {
    clearSession();
    this.currentUserSubject.next(null);
  }
}
