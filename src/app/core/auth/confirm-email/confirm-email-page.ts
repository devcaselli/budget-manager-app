import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';

/**
 * The 3-state discriminated union for this screen (F-C4 plan doc). `verifying`
 * is the initial state on load; it resolves to exactly one of the other two
 * and never returns to `verifying`. Modeled as a union (not a boolean +
 * optional fields) so a template `@switch` on `state().kind` is exhaustive
 * and a consumer can't construct an invalid combination (e.g. "success" with
 * an error message still attached).
 */
type ConfirmEmailState =
  | { readonly kind: 'verifying' }
  | { readonly kind: 'success' }
  | { readonly kind: 'invalid-or-expired' };

/**
 * Public landing route `/confirm-email?token=...` — the exact URL shape the
 * backend's confirmation email links to (`${appBaseUrl}/confirm-email?token=
 * ${plaintextToken}`, Tema B backend B4).
 *
 * **Updated by F-C6**: `token` is now a plain `@Input()`, bound automatically
 * by the router via `withComponentInputBinding()` (enabled globally in
 * `app.config.ts` by F-C6 — see that file's doc comment for the full
 * reasoning). Originally this screen read `ActivatedRoute.snapshot
 * .queryParamMap` directly, because F-C4 predates F-C6 (the task the plan doc
 * explicitly assigned to decide whether to enable that router-wide flag) and
 * deliberately didn't reach outside its own scope to flip a global config.
 * Now that F-C6 has enabled the flag for `ResetPasswordPage` (the epic's other
 * "consume a token from the URL" screen), this component was retrofitted to
 * the same mechanism — two nearly-identical screen shapes reading a URL token
 * in two different ways was worth avoiding once one of them needed the flag
 * anyway. Behavior is unchanged: confirmation still fires exactly once, via
 * `ngOnInit` instead of the constructor (an `@Input()` isn't guaranteed set
 * yet inside the constructor; `ngOnInit` is the correct lifecycle hook once
 * inputs are involved) — there's still no scenario where this component needs
 * to react to the query param changing under it later.
 *
 * Anti-enumeration discipline (Tema C, established by F-C1/F-C3): the backend
 * deliberately returns the same `INVALID_OR_EXPIRED_TOKEN` code whether the
 * token is unknown, expired, already consumed, or issued for a different
 * purpose. This screen must not invent frontend copy that tries to guess
 * which of those four actually happened — `invalid-or-expired` gets one
 * generic message, matching the backend's own ambiguity.
 *
 * Resend wrinkle: `AuthService.resendConfirmation()` needs an email, but this
 * screen only ever has a token from the URL — unlike F-C3's `/check-email`,
 * there is no just-completed signup flow to hand an email off from. Solved by
 * showing a small email input alongside the resend action in the
 * `invalid-or-expired` state, so the offered resend is actually wired to a
 * real address instead of being a dead button with nothing to send to.
 */
@Component({
  selector: 'app-confirm-email-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './confirm-email-page.html',
  styleUrl: './confirm-email-page.scss',
})
export class ConfirmEmailPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Bound automatically from the `token` query param by
   * `withComponentInputBinding()` (F-C6). `undefined` when the param is
   * absent from the URL — the router does not pass an empty string.
   */
  readonly token = input<string>();

  protected readonly state = signal<ConfirmEmailState>({ kind: 'verifying' });

  protected readonly resendPending = signal(false);
  /** Same always-generic message regardless of the resend outcome — see class doc. */
  protected readonly resendMessage = signal('');

  protected readonly resendForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  ngOnInit(): void {
    const token = this.token();

    if (!token) {
      // No token in the URL at all (someone navigates to /confirm-email
      // directly). Go straight to invalid-or-expired without attempting a
      // backend call with an empty/missing token — there is no outcome that
      // call could report other than the exact same rejection, so it would
      // only cost a network round trip and a moment of misleading
      // "verifying" UI for a case we already know the answer to.
      this.state.set({ kind: 'invalid-or-expired' });
      return;
    }

    this.confirmEmail(token);
  }

  private confirmEmail(token: string): void {
    this.authService
      .confirmEmail(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set({ kind: 'success' }),
        // Deliberately not branching on `error.code` here beyond routing to
        // the same `invalid-or-expired` state — the only realistic failure
        // for this endpoint per F-C1 is INVALID_OR_EXPIRED_TOKEN, and even a
        // genuinely unexpected `UNKNOWN` code gets the same generic screen
        // rather than a distinct "something else went wrong" message that
        // would leak more detail than the backend itself provides.
        error: () => this.state.set({ kind: 'invalid-or-expired' }),
      });
  }

  protected onResendSubmit(): void {
    if (this.resendForm.invalid || this.resendPending()) {
      return;
    }

    const email = this.resendForm.controls.email.value;
    this.resendPending.set(true);
    this.resendMessage.set('');

    this.authService
      .resendConfirmation(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onResendSettled(),
        // Same always-200 anti-enumeration contract as CheckEmailPage
        // (F-C3) — success and failure settle identically, in both copy and
        // timing, so this screen can't be used to probe account existence.
        error: () => this.onResendSettled(),
      });
  }

  private onResendSettled(): void {
    this.resendPending.set(false);
    this.resendMessage.set("If your account needs verification, we've sent a new email.");
  }

  protected onGoToLogin(): void {
    this.router.navigate(['/login']);
  }
}
