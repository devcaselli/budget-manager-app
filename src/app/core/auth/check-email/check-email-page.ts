import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { takeWhile } from 'rxjs/operators';

import { AuthService } from '@core/auth/auth.service';

/** Cooldown length (F-C3 plan doc — 60s, `signal` + `interval` + `takeUntilDestroyed`). */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * "Check your email" screen shown right after a successful signup
 * (`LoginPage.onSignupSubmit()`, F-B2/F-C3). Communicates that a
 * confirmation email was sent and offers a resend action.
 *
 * NOT a hard gate — the epic's confirmed soft-verification design allows
 * login before email confirmation (Tema C plan doc, decision 2), so this
 * screen must always be dismissible. "Continue to app" navigates to
 * `/dashboard` unconditionally; there is no mechanism here that can trap
 * the user waiting on an email.
 *
 * Email hand-off: read from `Router.getCurrentNavigation()`'s `extras.state`
 * (in-memory, set by the navigating caller — see `LoginPage.onSignupSubmit()`),
 * not a query param. A public route's query string can end up in browser
 * history/referrer headers; router state never touches the URL. This does
 * mean a hard refresh of `/check-email` loses the email — acceptable given
 * this screen is optional/dismissible by design: the resend button simply
 * has nothing to resend to until the user provides it another way (there is
 * no form here to re-enter it; refreshing away from a fresh signup is an
 * edge case, not a supported round-trip).
 */
@Component({
  selector: 'app-check-email-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './check-email-page.html',
  styleUrl: './check-email-page.scss',
})
export class CheckEmailPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly email = signal<string | null>(null);
  protected readonly cooldownSeconds = signal(0);
  protected readonly resendPending = signal(false);
  /**
   * Always the same generic copy regardless of what the resend call actually
   * did server-side — `resendConfirmation()` hits an always-200
   * anti-enumeration endpoint (F-C1), so "sent" and "already verified" and
   * any other server-side branch must look identical here.
   */
  protected readonly resendMessage = signal('');

  constructor() {
    // `getCurrentNavigation()` is only non-null while this component is being
    // constructed as the target of an in-flight navigation — read it here,
    // not in ngOnInit, or it is always null. Falls back to `history.state`
    // (what the Router itself writes state into) for the same-URL case,
    // e.g. a test harness or a caller that mutates history directly.
    const fromNavigation = this.router.getCurrentNavigation()?.extras.state as
      | { email?: string }
      | undefined;
    const fromHistory = history.state as { email?: string } | null;
    const resolvedEmail = fromNavigation?.email ?? fromHistory?.email ?? null;

    if (resolvedEmail) {
      this.email.set(resolvedEmail);
    }
  }

  protected get canResend(): boolean {
    return this.email() !== null && this.cooldownSeconds() === 0 && !this.resendPending();
  }

  protected onResend(): void {
    const email = this.email();
    if (!this.canResend || !email) {
      return;
    }

    this.resendPending.set(true);
    this.resendMessage.set('');

    this.authService
      .resendConfirmation(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onResendSettled(),
        // The always-200 anti-enumeration contract means a genuine failure here
        // is a real infra problem (network error, rate limit) — not a signal
        // about account state. Settling identically on error (same message,
        // same cooldown start) keeps this screen from ever behaving
        // differently based on the resend outcome, in copy or in timing.
        error: () => this.onResendSettled(),
      });
  }

  /** Shared success/error tail for `onResend` — see the `error` handler's comment above. */
  private onResendSettled(): void {
    this.resendPending.set(false);
    this.resendMessage.set("If your account needs verification, we've sent a new email.");
    this.startCooldown();
  }

  /**
   * One tick per second, counting down from `RESEND_COOLDOWN_SECONDS` to 0.
   * `takeWhile` (inclusive) completes the interval itself once it reaches 0
   * — without it, each resend click would stack a new never-ending
   * `interval` subscription on top of the previous one(s); `takeUntilDestroyed`
   * alone only guarantees cleanup on component destroy, not between clicks.
   */
  private startCooldown(): void {
    this.cooldownSeconds.set(RESEND_COOLDOWN_SECONDS);

    interval(1000)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeWhile(() => this.cooldownSeconds() > 0),
      )
      .subscribe(() => {
        this.cooldownSeconds.set(Math.max(this.cooldownSeconds() - 1, 0));
      });
  }

  protected onContinue(): void {
    this.router.navigate(['/dashboard']);
  }
}
