export interface AuthUser {
  readonly email: string;
  /**
   * Real display name sourced from the backend's `TokenResponse.displayName`.
   * `null` means the backend has no display name on file for this user yet
   * (fresh account, or a legacy account predating this field) — never a
   * fabricated placeholder. Consumers must handle `null` explicitly.
   */
  readonly name: string | null;
  readonly initials: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  /**
   * Real display name, trimmed by the caller before submission.
   * Backend contract (`RegisterRequestDto`, Tema A / A4): `@NotBlank`,
   * `@Size(min=2, max=50)`, permissive pattern rejecting only control
   * characters — accents, hyphens, spaces, apostrophes are all valid.
   */
  readonly displayName: string;
}

export interface TokenResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresIn: number;
  /**
   * Real display name, confirmed shipped on the backend (Tema A, task A5) on
   * `POST /auth/token` and `POST /auth/refresh`. `null`/absent for a user
   * with no display name on file yet (backend's own confirmed "legacy
   * displayName: leave null, require completion on next login" decision).
   * NOT present on `RegisterResponse` — deliberate anti-enumeration design;
   * the frontend must source the real name from the follow-up `/auth/token`
   * call in the login flow, never from register's own response.
   */
  readonly displayName: string | null;
}

export interface RefreshRequest {
  readonly refreshToken: string;
}

export interface RegisterResponse {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
}

/**
 * Request body for `PATCH /users/me` (F-B3). The backend trims server-side
 * BEFORE validation, so the frontend does not need to trim before sending —
 * trimming client-side is only done here for UX (showing the user what will
 * actually be persisted), same bounds as `RegisterRequest.displayName`.
 */
export interface UpdateProfileRequest {
  readonly displayName: string;
}

/**
 * Response body for `PATCH /users/me` (F-B3). Used directly to refresh the
 * in-memory session (`currentUserSubject`) — no full re-login or token
 * refresh needed, this shape exists specifically to let callers update state
 * immediately.
 */
export interface UpdateProfileResponse {
  readonly id: string;
  readonly displayName: string;
}

export interface StoredSession {
  readonly email: string;
  readonly token: string;
  readonly refreshToken: string;
  /**
   * Persisted so a returning user's name survives a page reload without
   * re-hitting the backend. Optional (not `readonly name: string | null`)
   * because a session written to `localStorage` BEFORE this field existed
   * deserializes with this property entirely absent from the parsed JSON —
   * `readSession()` must treat that legacy shape the same as a fresh `null`.
   */
  readonly name?: string | null;
}

/**
 * Discriminated union of every `code` value the auth API's `ProblemDetail`
 * responses can carry, plus forward-looking/theoretical members documented below.
 *
 * Confirmed live in the backend today (`ProblemDetail.code`, a top-level sibling of
 * `title`/`detail`/`status`, RFC 7807 style) — these 4 member names are copied
 * verbatim from the backend's actual `code` strings, not renamed for frontend taste,
 * because a mismatch here would silently break error handling:
 * - `INVALID_CREDENTIALS` (401) — wrong password OR unknown email on `POST /auth/token`.
 *   Deliberately the same code for both cases (anti-enumeration).
 * - `INVALID_OR_EXPIRED_TOKEN` (400) — `verify-email` / `resend-verification` /
 *   `reset-password` given a nonexistent, expired, consumed, or wrong-purpose token.
 *   One code covers all 4 causes; the backend does not distinguish them.
 * - `UNAUTHORIZED` (401) — missing/invalid bearer token on a protected endpoint.
 *   Distinct from `INVALID_CREDENTIALS`: this is "you're not logged in", not "your
 *   login attempt failed".
 * - `RATE_LIMITED` (429) — any of the 6 rate-limited auth endpoints (register, token,
 *   verify-email, resend-verification, forgot-password, reset-password) tripping its
 *   IP or email bucket.
 *
 * NOT backed by the backend yet — included only as forward-looking type design so
 * consumers can compile an exhaustive switch today without churn later. No code path
 * can currently produce these; do not assume they are reachable from a real HTTP call:
 * - `EMAIL_EXISTS` — `AuthController.register` swallows duplicate-email registration
 *   anti-enumeration-style and never surfaces a distinguishable error today.
 * - `EMAIL_NOT_CONFIRMED` — not sent; login before email verification is currently
 *   allowed per the epic's confirmed soft-verification design.
 * - `OTP_REQUIRED`, `OTP_INVALID` — Tema D (OTP/2FA) has not started; these codes do
 *   not exist in any backend response yet.
 *
 * `UNKNOWN` is the required fallback for network errors, malformed response bodies,
 * or a `code` string this frontend build doesn't recognize (forward compatibility
 * with future backend codes) — never crash, never silently guess.
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_OR_EXPIRED_TOKEN'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'EMAIL_EXISTS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'OTP_REQUIRED'
  | 'OTP_INVALID'
  | 'UNKNOWN';

/** Shape of the `code` extension property on the backend's RFC 7807 `ProblemDetail` body. */
export interface ProblemDetailBody {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code?: string;
  readonly correlationId?: string;
}

/**
 * Typed auth error carrying a discriminated `AuthErrorCode` so callers can branch on
 * `code` (exhaustively, via `assertNever`) instead of matching HTTP status + message
 * substrings. `message` is still populated (kept human-readable for direct display,
 * e.g. `err.message` in a template) but must never be used to decide control flow —
 * that's what `code` is for.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
