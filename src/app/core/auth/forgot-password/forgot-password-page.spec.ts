import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';

import { ForgotPasswordPage } from './forgot-password-page';

describe('ForgotPasswordPage', () => {
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let authService: { requestPasswordReset: ReturnType<typeof vi.fn> };
  let router: Router;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function emailInput(): HTMLInputElement {
    return root().querySelector('#forgot-password-email') as HTMLInputElement;
  }

  function submitButton(): HTMLButtonElement {
    return root().querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  function heading(): string | null {
    return root().querySelector('.ew-forgot-password-h')?.textContent?.trim() ?? null;
  }

  function setInput(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    const form = root().querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  async function setUp(
    requestPasswordReset: ReturnType<typeof vi.fn> = vi.fn(),
  ): Promise<void> {
    authService = { requestPasswordReset };

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ForgotPasswordPage);
    fixture.detectChanges();
  }

  describe('initial render', () => {
    it('shows the request form with an email field', async () => {
      await setUp();

      expect(heading()).toBe('Forgot your password?');
      expect(emailInput()).toBeTruthy();
      expect(submitButton()).toBeTruthy();
    });

    it('offers a link back to sign in', async () => {
      await setUp();

      const link = root().querySelector('.ew-auth-hint a') as HTMLElement;
      link.click();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('form validation — mirrors LoginPage email field rules', () => {
    it('disables submit when the email is empty', async () => {
      await setUp();

      expect(submitButton().disabled).toBe(true);
    });

    it('disables submit when the email is not a valid format', async () => {
      await setUp();

      setInput(emailInput(), 'not-an-email');
      fixture.detectChanges();

      expect(submitButton().disabled).toBe(true);
    });

    it('does not call requestPasswordReset when the form is invalid', async () => {
      const requestPasswordReset = vi.fn().mockReturnValue(of(undefined));
      await setUp(requestPasswordReset);

      submit();

      expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it('enables submit and calls requestPasswordReset with a valid email', async () => {
      const requestPasswordReset = vi.fn().mockReturnValue(of(undefined));
      await setUp(requestPasswordReset);

      setInput(emailInput(), 'user@example.com');
      fixture.detectChanges();

      expect(submitButton().disabled).toBe(false);

      submit();

      expect(requestPasswordReset).toHaveBeenCalledWith('user@example.com');
    });
  });

  const GENERIC_MESSAGE =
    'If an account exists for that email, we sent a link to reset your password.';
  const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a bit before trying again.';

  describe('anti-enumeration discipline — successful submit', () => {
    it('shows the generic message on success', async () => {
      const requestPasswordReset = vi.fn().mockReturnValue(of(undefined));
      await setUp(requestPasswordReset);

      setInput(emailInput(), 'user@example.com');
      fixture.detectChanges();
      submit();

      expect(root().querySelector('.ew-forgot-password-message')?.textContent?.trim()).toBe(
        GENERIC_MESSAGE,
      );
    });

    it('replaces the form with the submitted state (no re-submission)', async () => {
      const requestPasswordReset = vi.fn().mockReturnValue(of(undefined));
      await setUp(requestPasswordReset);

      setInput(emailInput(), 'user@example.com');
      fixture.detectChanges();
      submit();

      expect(root().querySelector('#forgot-password-email')).toBeFalsy();
    });
  });

  describe('anti-enumeration discipline — RATE_LIMITED gets distinct, non-leaking treatment', () => {
    it('shows a distinct message for RATE_LIMITED, different from the generic success message', async () => {
      const requestPasswordReset = vi
        .fn()
        .mockReturnValue(throwError(() => new AuthError('RATE_LIMITED', 'Too many attempts.')));
      await setUp(requestPasswordReset);

      setInput(emailInput(), 'user@example.com');
      fixture.detectChanges();
      submit();

      const message = root().querySelector('.ew-forgot-password-message')?.textContent?.trim();
      expect(message).toBe(RATE_LIMITED_MESSAGE);
      expect(message).not.toBe(GENERIC_MESSAGE);
    });
  });

  describe('anti-enumeration discipline — every other error folds into the generic message', () => {
    const nonLeakingCodes: ReadonlyArray<AuthError['code']> = [
      'UNKNOWN',
      'INVALID_CREDENTIALS',
      'INVALID_OR_EXPIRED_TOKEN',
      'UNAUTHORIZED',
      'EMAIL_EXISTS',
      'EMAIL_NOT_CONFIRMED',
      'OTP_REQUIRED',
      'OTP_INVALID',
    ];

    for (const code of nonLeakingCodes) {
      it(`shows the SAME generic message for ${code} as for a real success (no enumeration hint)`, async () => {
        const requestPasswordReset = vi
          .fn()
          .mockReturnValue(throwError(() => new AuthError(code, 'x')));
        await setUp(requestPasswordReset);

        setInput(emailInput(), 'user@example.com');
        fixture.detectChanges();
        submit();

        const message = root().querySelector('.ew-forgot-password-message')?.textContent?.trim();
        expect(message).toBe(GENERIC_MESSAGE);
      });
    }
  });

  describe('submitted state', () => {
    it('offers a way back to sign in', async () => {
      const requestPasswordReset = vi.fn().mockReturnValue(of(undefined));
      await setUp(requestPasswordReset);

      setInput(emailInput(), 'user@example.com');
      fixture.detectChanges();
      submit();

      const backButton = root().querySelector('button.ew-auth-submit') as HTMLButtonElement;
      backButton.click();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
