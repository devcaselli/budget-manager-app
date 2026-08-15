import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';

/**
 * The 2-state union for this screen (F-C5 plan doc). `form` is the initial
 * state; `submitted` carries whatever message the submit should show and
 * never reverts to `form` — matching the "settle once" shape already used by
 * `ConfirmEmailPage`'s (F-C4) `ConfirmEmailState`.
 *
 * `variant` exists ONLY to pick a CSS treatment (e.g. a distinct color for
 * the rate-limit case) — it must never gate which `message` string is shown
 * beyond what's already baked into that string by `onSubmitSettled`. See the
 * anti-enumeration discipline note on `onSubmit()` below for exactly which
 * outcomes get the generic message vs. the distinct one.
 */
type ForgotPasswordState =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitted'; readonly message: string; readonly variant: 'generic' | 'rate-limited' };

const GENERIC_MESSAGE = 'If an account exists for that email, we sent a link to reset your password.';
const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a bit before trying again.';

/**
 * Public route `/forgot-password` (F-C5) — request-a-reset screen reached
 * from the "Forgot password?" link on `LoginPage`. Route name matches the
 * backend endpoint's own naming (`POST /auth/forgot-password`, F-C1) for
 * consistency, same convention `/confirm-email` and `/check-email` already
 * follow relative to their own backend counterparts.
 *
 * Scope: this is ONLY the request-a-reset screen (email in, generic message
 * out). The screen that consumes the reset-email's token and lets the user
 * set a new password is F-C6 — not built here.
 *
 * ANTI-ENUMERATION DISCIPLINE (plan doc's explicit acceptance criterion,
 * verbatim: "resposta sempre genérica ... não vazar existência de conta"):
 *
 * `AuthService.requestPasswordReset()` hits an always-200 anti-enumeration
 * endpoint (F-C1) — unknown email, unconfirmed email (password reset
 * requires a CONFIRMED email per the backend's own design, so an unverified
 * account is indistinguishable from an unknown one here too), and a genuine
 * reset-email-sent all resolve identically as a plain `next`. So the ONLY
 * error this screen treats distinctly is `RATE_LIMITED` — that code
 * describes THIS caller's own request rate, not anything about the target
 * account, so showing a different (but still non-leaking) message for it is
 * safe. Every other conceivable error code (network failure/`UNKNOWN`, or
 * any future code this build doesn't recognize) is folded into the SAME
 * generic success message on purpose — see `onSubmit()`'s `error` handler.
 * This is a deliberate "when in doubt, fold it into generic" judgment call:
 * erring toward under-distinguishing is the safe direction for an
 * anti-enumeration surface, over-distinguishing is not.
 */
@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './forgot-password-page.html',
  styleUrl: './forgot-password-page.scss',
})
export class ForgotPasswordPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<ForgotPasswordState>({ kind: 'form' });
  protected readonly submitPending = signal(false);

  // Same email-validation convention as LoginPage's own email field
  // (`Validators.required` + `Validators.email`) — mirrored here, not
  // invented anew.
  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  protected onSubmit(): void {
    if (this.form.invalid || this.submitPending()) {
      return;
    }

    const email = this.form.controls.email.value;
    this.submitPending.set(true);

    this.authService
      .requestPasswordReset(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onSubmitSettled({ message: GENERIC_MESSAGE, variant: 'generic' }),
        error: (err: AuthError) => {
          // RATE_LIMITED is the one code that legitimately gets distinct
          // treatment — see the class doc's anti-enumeration note. Every
          // other code (including UNKNOWN) folds into the same generic
          // message the success path shows.
          if (err.code === 'RATE_LIMITED') {
            this.onSubmitSettled({ message: RATE_LIMITED_MESSAGE, variant: 'rate-limited' });
            return;
          }
          this.onSubmitSettled({ message: GENERIC_MESSAGE, variant: 'generic' });
        },
      });
  }

  private onSubmitSettled(result: { message: string; variant: 'generic' | 'rate-limited' }): void {
    this.submitPending.set(false);
    this.state.set({ kind: 'submitted', message: result.message, variant: result.variant });
  }

  protected onBackToLogin(): void {
    this.router.navigate(['/login']);
  }
}
