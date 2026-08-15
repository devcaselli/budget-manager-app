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
  /**
   * Sourced from `TokenResponse.emailVerified` (backend Tema B7, `f990424`).
   * `true`/`false` on any fresh login or token refresh — the backend's
   * `/auth/refresh` path deliberately re-fetches this live via
   * `RefreshUseCase`'s `findById(userId)` call, unlike `displayName`, which
   * is omitted (always `null`) on refresh. So, UNLIKE `name`, this field is
   * always authoritative on both `login()` and `refreshAccessToken()` — no
   * "preserve the prior value" fallback is needed or correct here.
   *
   * `null` only for a session predating this field entirely (a `StoredSession`
   * blob written before F-C7, or in-memory state built before the very first
   * login/refresh completes) — see `StoredSession.emailVerified` for the
   * legacy-shape handling. Treated as "unverified" by the shell's banner
   * (F-C7 decision): an unknown verification state must never silently
   * suppress a legitimate soft-verification prompt.
   */
  readonly emailVerified: boolean | null;
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
  /**
   * Confirmed shipped on the backend (Tema B, task B7, commit `f990424`) on
   * both `POST /auth/token` AND `POST /auth/refresh` — unlike `displayName`,
   * this field is a boolean primitive with a real default (`false`), so the
   * backend never omits it. On `/auth/refresh` specifically, `RefreshUseCase`
   * deliberately re-fetches this live via `UserRepository.findById(userId)`
   * rather than trusting anything cached on the refresh token record — the
   * backend's own reasoning: `emailVerified` gates password-reset and
   * account-deletion, so a stale claim here is a security bug, not cosmetic
   * drift the way a stale `displayName` would be. Always authoritative on
   * both endpoints; never treat a value here as "unchanged, keep the prior
   * session's value" the way `displayName` must be treated on refresh.
   */
  readonly emailVerified: boolean;
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

/**
 * Request body for `POST /auth/resend-verification` (F-C1). Backend response
 * is a generic, always-200 anti-enumeration body carrying no data the caller
 * needs — this is the only interface required for the request side.
 */
export interface ResendConfirmationRequest {
  readonly email: string;
}

/**
 * Request body for `POST /auth/forgot-password` (F-C1). Same always-200
 * anti-enumeration contract as `ResendConfirmationRequest` — the response
 * body carries no data the caller needs.
 */
export interface RequestPasswordResetRequest {
  readonly email: string;
}

/**
 * Request body for `POST /auth/reset-password` (F-C1). `token` is the
 * plaintext token from the reset-password email link. Same password bounds
 * as `RegisterRequest.displayName`'s sibling field on registration (min 12 /
 * max 128 / at least 1 letter + 1 digit) — enforced server-side; this
 * interface does not itself validate.
 */
export interface ConfirmPasswordResetRequest {
  readonly token: string;
  readonly newPassword: string;
}

/**
 * Request body for `POST /auth/verify-email` (F-C1). `token` is the
 * plaintext token from the confirmation email link.
 */
export interface ConfirmEmailRequest {
  readonly token: string;
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
  /**
   * Persisted so the shell's "confirm your email" banner (F-C7) survives a
   * page reload without waiting on a token refresh. Optional for the same
   * legacy-shape reason as `name?`: a session blob written before F-C7
   * deserializes with this property entirely absent (not `false`) from the
   * parsed JSON. `readSession()` normalizes absent/`undefined` to `null`,
   * and the shell treats `null` the same as `false` (show the banner) — see
   * `AuthUser.emailVerified`'s doc for why that's the safe default here,
   * which is the OPPOSITE safe-default direction from `name?`'s legacy-null
   * handling (there, `null` means "show a harmless fallback"; here, `null`
   * means "assume unverified" so a real prompt is never silently suppressed).
   */
  readonly emailVerified?: boolean | null;
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
