import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';

import { ResetPasswordPage } from './reset-password-page';

describe('ResetPasswordPage', () => {
  let fixture: ComponentFixture<ResetPasswordPage>;
  let authService: { confirmPasswordReset: ReturnType<typeof vi.fn> };
  let router: Router;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function heading(): string | null {
    return root().querySelector('.ew-reset-password-h')?.textContent?.trim() ?? null;
  }

  function newPasswordInput(): HTMLInputElement {
    return root().querySelector('#reset-password-new') as HTMLInputElement;
  }

  function confirmPasswordInput(): HTMLInputElement {
    return root().querySelector('#reset-password-confirm') as HTMLInputElement;
  }

  function submitButton(): HTMLButtonElement {
    return root().querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  function setInput(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submitForm(): void {
    const form = root().querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  /**
   * Builds the component with a given `token` set via `@Input()` — the same
   * value `withComponentInputBinding()` would bind from the `token` query
   * param in the real router (F-C6, mirroring ConfirmEmailPage's F-C4 spec
   * convention after its own retrofit to the same mechanism).
   */
  async function setUp(
    token: string | null,
    confirmPasswordReset: ReturnType<typeof vi.fn> = vi.fn(() => of(undefined)),
  ): Promise<void> {
    authService = { confirmPasswordReset };

    await TestBed.configureTestingModule({
      imports: [ResetPasswordPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ResetPasswordPage);
    if (token) {
      fixture.componentRef.setInput('token', token);
    }
    fixture.detectChanges();
  }

  const VALID_PASSWORD = 'abcdefghij1a'; // 12 chars, 1 letter block + 1 digit — meets the real backend policy

  describe('no token in URL', () => {
    it('goes straight to invalid-or-expired without calling confirmPasswordReset', async () => {
      const confirmPasswordReset = vi.fn(() => of(undefined));
      await setUp(null, confirmPasswordReset);

      expect(confirmPasswordReset).not.toHaveBeenCalled();
      expect(heading()).toBe("This link isn't valid");
    });
  });

  describe('form state', () => {
    beforeEach(async () => {
      await setUp('abc123');
    });

    it('renders the form with new-password and confirm-password fields', () => {
      expect(heading()).toBe('Set a new password');
      expect(newPasswordInput()).toBeTruthy();
      expect(confirmPasswordInput()).toBeTruthy();
    });

    it('renders the shared password-strength checklist', () => {
      expect(root().querySelector('app-password-strength')).toBeTruthy();
    });

    it('disables submit while the form is empty', () => {
      expect(submitButton().disabled).toBe(true);
    });
  });

  describe('successful submit', () => {
    it('calls confirmPasswordReset with the URL token and the new password', async () => {
      const confirmPasswordReset = vi.fn(() => of(undefined));
      await setUp('real-token-123', confirmPasswordReset);

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      expect(confirmPasswordReset).toHaveBeenCalledWith('real-token-123', VALID_PASSWORD);
    });

    it('transitions to the success state with anti-session-assumption copy', async () => {
      await setUp('abc123', vi.fn(() => of(undefined)));

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      expect(heading()).toBe('Password reset');
      expect(root().textContent).toContain('signed out everywhere');
    });

    it('navigates to /login when continuing from the success state (never assumes an active session)', async () => {
      await setUp('abc123', vi.fn(() => of(undefined)));

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      const continueButton = root().querySelector('button.ew-auth-submit') as HTMLButtonElement;
      continueButton.click();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('password mismatch (client-side, no backend call)', () => {
    it('shows a validation error and does not call confirmPasswordReset', async () => {
      const confirmPasswordReset = vi.fn(() => of(undefined));
      await setUp('abc123', confirmPasswordReset);

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), 'differentpassword1a');
      fixture.detectChanges();
      submitForm();

      expect(confirmPasswordReset).not.toHaveBeenCalled();
      expect(root().querySelector('.ew-auth-err')?.textContent).toContain('do not match');
    });
  });

  describe('password fails strength requirements (client-side, no backend call)', () => {
    it('blocks a too-short password and shows granular per-requirement feedback', async () => {
      const confirmPasswordReset = vi.fn(() => of(undefined));
      await setUp('abc123', confirmPasswordReset);

      setInput(newPasswordInput(), 'short1a');
      setInput(confirmPasswordInput(), 'short1a');
      fixture.detectChanges();

      // Granular feedback comes from the live PasswordStrengthComponent
      // checklist, not just the submit-time error message.
      const rows = Array.from(root().querySelectorAll('.ew-pw-rules > div'));
      const lengthRow = rows.find((r) => r.textContent?.includes('chars'));
      expect(lengthRow?.classList.contains('ew-ok')).toBe(false);

      submitForm();
      expect(confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('blocks a password with no digit', async () => {
      const confirmPasswordReset = vi.fn(() => of(undefined));
      await setUp('abc123', confirmPasswordReset);

      setInput(newPasswordInput(), 'nodigitsatall');
      setInput(confirmPasswordInput(), 'nodigitsatall');
      fixture.detectChanges();
      submitForm();

      expect(confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('blocks a password with no letter', async () => {
      const confirmPasswordReset = vi.fn(() => of(undefined));
      await setUp('abc123', confirmPasswordReset);

      setInput(newPasswordInput(), '123456789012');
      setInput(confirmPasswordInput(), '123456789012');
      fixture.detectChanges();
      submitForm();

      expect(confirmPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('INVALID_OR_EXPIRED_TOKEN failure', () => {
    it('transitions to the generic anti-enumeration-respecting invalid state', async () => {
      const confirmPasswordReset = vi.fn(() =>
        throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired link or code.')),
      );
      await setUp('bad-token', confirmPasswordReset);

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      expect(heading()).toBe("This link isn't valid");
    });

    it('does not attempt to distinguish why the token failed in its messaging', async () => {
      const confirmPasswordReset = vi.fn(() =>
        throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired link or code.')),
      );
      await setUp('bad-token', confirmPasswordReset);

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      const text = root().textContent ?? '';
      expect(text).toContain('invalid or has expired');
      expect(text.toLowerCase()).not.toContain('already used');
      expect(text.toLowerCase()).not.toContain('already consumed');
      expect(text.toLowerCase()).not.toContain('wrong purpose');
    });

    it('offers a link to request a new reset link', async () => {
      const confirmPasswordReset = vi.fn(() =>
        throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x')),
      );
      await setUp('bad-token', confirmPasswordReset);

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      const link = root().querySelector('a.ew-reset-password-link-btn') as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/forgot-password');
    });
  });

  describe('other backend failure (e.g. UNKNOWN)', () => {
    it('surfaces a page-level error without abandoning the form', async () => {
      const confirmPasswordReset = vi.fn(() =>
        throwError(() => new AuthError('UNKNOWN', 'Something went wrong. Please try again.')),
      );
      await setUp('abc123', confirmPasswordReset);

      setInput(newPasswordInput(), VALID_PASSWORD);
      setInput(confirmPasswordInput(), VALID_PASSWORD);
      fixture.detectChanges();
      submitForm();

      expect(heading()).toBe('Set a new password');
      expect(root().querySelector('.ew-auth-err')?.textContent).toContain('Something went wrong');
    });
  });

  describe('"Back to sign in" link', () => {
    it('navigates to /login from the form state', async () => {
      await setUp('abc123');

      const link = root().querySelector('.ew-auth-hint a') as HTMLElement;
      link.click();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
