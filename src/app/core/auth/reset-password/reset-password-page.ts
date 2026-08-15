import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';
import {
  evaluatePasswordRules,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordStrengthComponent,
} from '@shared/components/password-strength/password-strength.component';

/**
 * The 3-state union for this screen, same "settle once" shape as
 * `ConfirmEmailState` (F-C4) and `ForgotPasswordState` (F-C5). `form` is the
 * initial state whenever a token was present in the URL; `success` and
 * `invalid-or-expired` are terminal — neither reverts to `form`. Modeled as a
 * union (not booleans) so `@switch (state().kind)` is exhaustive.
 */
type ResetPasswordState =
  | { readonly kind: 'form' }
  | { readonly kind: 'success' }
  | { readonly kind: 'invalid-or-expired' };

/**
 * Public landing route `/reset-password?token=...` (F-C6) — the exact URL
 * shape the backend's password-reset email links to
 * (`${appBaseUrl}/reset-password?token=${plaintextToken}`, backend C1/C2).
 * This is the screen F-C5's "Forgot password?" flow hands off to once the
 * user clicks the email link.
 *
 * **`token` via `withComponentInputBinding()`** — this task (F-C6) is the one
 * the plan doc explicitly designated to decide whether to enable that
 * router-wide flag (decision 3), previously deferred by F-C4. Decision: YES,
 * enabled globally in `app.config.ts` — see that file's doc comment for full
 * reasoning (short version: it's the plan doc's own original intent, the
 * effect is opt-in per-component so it can't silently break unrelated routed
 * components, and it's a strictly cleaner fit for "read a token query param
 * on load" than a manual snapshot read). `ConfirmEmailPage` (F-C4) was
 * retrofitted to the same mechanism in this same task, for consistency
 * across the epic's two nearly-identical "consume a token from URL" screens.
 *
 * **Password policy — the REAL backend contract, verified, not assumed.**
 * `ConfirmPasswordResetRequest.newPassword` (`POST /auth/reset-password`) is
 * confirmed byte-for-byte identical to `RegisterRequest`'s own password
 * policy on the backend's Bean Validation layer (backend plan doc, Tema C /
 * C3+C4: "política de senha reaproveitada... copia literalmente as mesmas
 * constraints... min 12, max 128, `@Pattern` letra+dígito") — min 12 / max
 * 128 chars, at least 1 letter + 1 digit. This is DELIBERATELY NOT the same
 * policy `login-page.ts`'s signup form or `settings-page.ts`'s password-change
 * stub currently enforce client-side (8+ chars, upper/lower/number/symbol/
 * match, no max) — that existing client-side policy predates this task and
 * does not match the real backend contract (a pre-existing frontend/backend
 * mismatch, out of scope to fix here; flagged as tech debt). This screen uses
 * the correct policy via the new shared `PasswordStrengthComponent`
 * (`shared/components/password-strength/`), NOT the signup form's existing
 * (incorrect) checklist — extracting/reusing the wrong policy into a brand
 * new screen would have been worse than not sharing at all.
 *
 * **Double-entry password confirmation** — mirrors the signup form's
 * established convention (`login-page.ts`'s `password`/`confirmPassword`
 * pair), same reasoning: a password-change flow benefits from catching a
 * typo before submit rather than after a successful-looking but wrong reset.
 *
 * **Post-success navigation assumes no active session.** `POST
 * /auth/reset-password` revokes ALL of the user's refresh tokens
 * server-side on success (backend C3/C4) — including this browser's own
 * session, if the user happened to still be logged in here when they reset.
 * This screen never assumes an authenticated state post-success: the
 * `success` state offers a link to `/login`, never a redirect to `/dashboard`
 * or any authenticated route. No `AuthService.logout()` call is needed
 * either — this screen's own `AuthService` instance never held a session for
 * this flow to begin with (a public route, reached via an emailed link, is
 * not gated by `authGuard`), so there is nothing to locally clear.
 *
 * **Anti-enumeration discipline for `INVALID_OR_EXPIRED_TOKEN`** — same
 * generic, cause-agnostic message as `ConfirmEmailPage`'s equivalent state
 * (F-C4): the backend deliberately uses one code for unknown/expired/
 * consumed/wrong-purpose tokens, so this screen must not invent frontend
 * copy that guesses which of those four actually happened.
 *
 * **A password-policy validation failure is the OPPOSITE case** — here,
 * specificity is correct and expected (not an anti-enumeration concern at
 * all, since it reveals nothing about account existence). Handled entirely
 * client-side via `PasswordStrengthComponent`'s live per-rule feedback
 * before submit is even attempted; the backend's mirrored Bean Validation
 * 400 (no recognized `code`, falls back to `AuthErrorCode.UNKNOWN` per
 * `auth.service.ts`) is a defense-in-depth backstop, not the primary UX path.
 *
 * **No token in the URL** — mirrors `ConfirmEmailPage`'s established
 * precedent (F-C4) exactly: go straight to `invalid-or-expired` without
 * attempting a backend call, since there is no outcome such a call could
 * report beyond the same rejection already known in advance.
 */
@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, PasswordStrengthComponent],
  templateUrl: './reset-password-page.html',
  styleUrl: './reset-password-page.scss',
})
export class ResetPasswordPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound automatically from the `token` query param by `withComponentInputBinding()`. */
  readonly token = input<string>();

  protected readonly state = signal<ResetPasswordState>({ kind: 'form' });
  protected readonly submitPending = signal(false);
  protected readonly submitError = signal('');

  protected readonly form = new FormGroup({
    newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  // Signals driven by FormControl.valueChanges — bound to PasswordStrengthComponent's
  // inputs and read by the submit guard, same bridging pattern login-page.ts
  // established for its own (differently-policied) checklist.
  protected readonly newPasswordValue = signal('');
  protected readonly confirmPasswordValue = signal('');

  private resolvedToken: string | null = null;

  constructor() {
    this.form.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.newPasswordValue.set(v));

    this.form.controls.confirmPassword.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.confirmPasswordValue.set(v));
  }

  ngOnInit(): void {
    const token = this.token();

    if (!token) {
      // No token in the URL at all — same precedent as ConfirmEmailPage
      // (F-C4): go straight to invalid-or-expired, no backend call attempted.
      this.state.set({ kind: 'invalid-or-expired' });
      return;
    }

    this.resolvedToken = token;
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitPending() || !this.resolvedToken) {
      return;
    }

    const { newPassword, confirmPassword } = this.form.getRawValue();

    const unmetRules = evaluatePasswordRules(newPassword, confirmPassword).filter((r) => !r.met);
    if (unmetRules.length > 0) {
      this.submitError.set(
        newPassword !== confirmPassword
          ? 'Passwords do not match.'
          : `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters with at least 1 letter and 1 digit.`,
      );
      return;
    }

    this.submitError.set('');
    this.submitPending.set(true);

    this.authService
      .confirmPasswordReset(this.resolvedToken, newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitPending.set(false);
          this.state.set({ kind: 'success' });
        },
        error: (err: AuthError) => {
          this.submitPending.set(false);

          if (err.code === 'INVALID_OR_EXPIRED_TOKEN') {
            // Same anti-enumeration-respecting generic state as
            // ConfirmEmailPage (F-C4) — never guess why the token failed.
            this.state.set({ kind: 'invalid-or-expired' });
            return;
          }

          // Any other failure (including UNKNOWN, e.g. a Bean Validation 400
          // the client-side check above somehow missed) surfaces as a
          // page-level error without abandoning the form — the token is
          // still valid, the user can just retry.
          this.submitError.set(err.message);
        },
      });
  }

  protected onGoToLogin(): void {
    this.router.navigate(['/login']);
  }
}
