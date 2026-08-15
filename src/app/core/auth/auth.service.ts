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
  ConfirmEmailRequest,
  ConfirmPasswordResetRequest,
  LoginRequest,
  ProblemDetailBody,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  RequestPasswordResetRequest,
  ResendConfirmationRequest,
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
 *
 * `emailVerified` (F-C7) is passed through as-is — `null` means "unknown"
 * (a legacy session predating this field), which callers/consumers (the
 * shell's banner) must treat as "unverified" per this task's safe-default
 * decision. Unlike `name`, there is no normalization step here: the backend
 * never sends an empty-string equivalent for a boolean field.
 */
function toAuthUser(email: string, name: string | null, emailVerified: boolean | null): AuthUser {
  const normalizedName = name && name.trim().length > 0 ? name : null;
  return {
    email,
    name: normalizedName,
    initials: deriveInitials(normalizedName, email),
    emailVerified,
  };
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
        // `session.name`/`session.emailVerified` are `undefined` for a legacy
        // StoredSession blob written before those fields existed (absent from
        // the parsed JSON, not `null`) — normalize both to `null` here so a
        // stale localStorage shape can never crash or leak an `undefined`
        // value into the UI. The shell treats a `null` `emailVerified` as
        // "unverified" (show the banner) — see `AuthUser.emailVerified`'s doc.
        this.currentUserSubject.next(
          toAuthUser(session.email, session.name ?? null, session.emailVerified ?? null),
        );
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
        const emailVerified = response.emailVerified;
        writeSession({
          email,
          token: response.accessToken,
          refreshToken: response.refreshToken,
          name,
          emailVerified,
        });
        this.currentUserSubject.next(toAuthUser(email, name, emailVerified));
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
   *
   * `response.emailVerified` (F-C7) is the OPPOSITE case: the backend's
   * `RefreshUseCase` deliberately re-fetches this live via
   * `UserRepository.findById(userId)` on every refresh (Tema B7, confirmed
   * in `backend-tasks.md` — `emailVerified` gates password-reset/account-
   * deletion, so a stale claim would be a security bug, not cosmetic drift).
   * It is always authoritative here, exactly like on `login()` — never
   * fall back to the pre-refresh session's value the way `name` does.
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
          // Unlike `name`, `response.emailVerified` IS authoritative on
          // refresh — the backend live-fetches it. Read it directly, never
          // fall back to `session.emailVerified`.
          const emailVerified = response.emailVerified;
          writeSession({
            email: session.email,
            token: response.accessToken,
            refreshToken: response.refreshToken,
            name,
            emailVerified,
          });
          this.currentUserSubject.next(toAuthUser(session.email, name, emailVerified));
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
        // `UpdateProfileResponse` carries no `emailVerified` field (this
        // endpoint only updates the display name) — preserve whatever the
        // pre-existing session already had, same "not authoritative here"
        // treatment `name` gets on the refresh path, for the same reason:
        // this response simply has nothing to say about verification state.
        const emailVerified = session.emailVerified ?? null;
        writeSession({
          email: session.email,
          token: session.token,
          refreshToken: session.refreshToken,
          name,
          emailVerified,
        });
        this.currentUserSubject.next(toAuthUser(session.email, name, emailVerified));
      }),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  /**
   * `POST /auth/resend-verification` (F-C1). ALWAYS 200 with a generic body,
   * by deliberate backend anti-enumeration design — the outcome looks
   * identical whether the email exists, is already verified, or genuinely
   * triggers a resend. The response body carries no data this caller needs,
   * so it is discarded (`map(() => undefined)`); the only realistic failure
   * path is a network error or `RATE_LIMITED` (429). Callers must not
   * attempt to infer account existence from this call succeeding or
   * failing — the backend intentionally makes that impossible.
   */
  resendConfirmation(email: string): Observable<void> {
    const body: ResendConfirmationRequest = { email };

    return this.http.post<unknown>(`${this.authUrl}/resend-verification`, body).pipe(
      map(() => undefined),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  /**
   * `POST /auth/forgot-password` (F-C1). Same always-200 anti-enumeration
   * contract as `resendConfirmation` — unknown email, unverified email, and
   * a real reset-email-sent all look identical to the caller. Discards the
   * generic response body; the only realistic failure path is a network
   * error or `RATE_LIMITED` (429).
   */
  requestPasswordReset(email: string): Observable<void> {
    const body: RequestPasswordResetRequest = { email };

    return this.http.post<unknown>(`${this.authUrl}/forgot-password`, body).pipe(
      map(() => undefined),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  /**
   * `POST /auth/reset-password` (F-C1). Unlike the always-200 endpoints
   * above, token validity genuinely varies per-request: an unknown, expired,
   * consumed, or wrong-purpose token fails with 400 `INVALID_OR_EXPIRED_TOKEN`
   * (the same union member `confirmEmail` uses — the backend deliberately
   * uses one code for all 4 rejection causes across both endpoints). A
   * password-policy violation fails with a standard 400 Bean Validation
   * error, which falls back to `UNKNOWN` via `mapHttpError` same as any other
   * unrecognized `code`.
   */
  confirmPasswordReset(token: string, newPassword: string): Observable<void> {
    const body: ConfirmPasswordResetRequest = { token, newPassword };

    return this.http.post<unknown>(`${this.authUrl}/reset-password`, body).pipe(
      map(() => undefined),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  /**
   * `POST /auth/verify-email` (F-C1). Success body is `{ emailVerified: true }`
   * but carries no data this caller needs — discarded. Failure is 400
   * `INVALID_OR_EXPIRED_TOKEN` for an unknown, expired, consumed, or
   * wrong-purpose token (same union member as `confirmPasswordReset`).
   */
  confirmEmail(token: string): Observable<void> {
    const body: ConfirmEmailRequest = { token };

    return this.http.post<unknown>(`${this.authUrl}/verify-email`, body).pipe(
      map(() => undefined),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  logout(): void {
    clearSession();
    this.currentUserSubject.next(null);
  }
}
