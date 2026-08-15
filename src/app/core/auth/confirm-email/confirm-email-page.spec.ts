import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';

import { ConfirmEmailPage } from './confirm-email-page';

describe('ConfirmEmailPage', () => {
  let fixture: ComponentFixture<ConfirmEmailPage>;
  let authService: {
    confirmEmail: ReturnType<typeof vi.fn>;
    resendConfirmation: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function heading(): string | null {
    return root().querySelector('.ew-confirm-email-h')?.textContent?.trim() ?? null;
  }

  function resendEmailInput(): HTMLInputElement | null {
    return root().querySelector('#confirm-email-resend-email');
  }

  function resendSubmitButton(): HTMLButtonElement | null {
    return root().querySelector('button[type="submit"]');
  }

  /**
   * Builds the component with a given `token` query param (or `null` for
   * "no token in the URL at all") pre-seeded on the `ActivatedRoute`
   * snapshot — the same synchronous read the component's constructor
   * performs. `confirmEmail`/`resendConfirmation` default to never-resolving
   * mocks so a test can control exactly when they settle.
   */
  async function setUp(
    token: string | null,
    confirmEmail: ReturnType<typeof vi.fn> = vi.fn(() => of(undefined)),
    resendConfirmation: ReturnType<typeof vi.fn> = vi.fn(() => of(undefined)),
  ): Promise<void> {
    authService = { confirmEmail, resendConfirmation };

    await TestBed.configureTestingModule({
      imports: [ConfirmEmailPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(token ? { token } : {}),
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ConfirmEmailPage);
    fixture.detectChanges();
  }

  describe('verifying state', () => {
    it('renders immediately on load and calls confirmEmail() with the URL token', async () => {
      const confirmEmail = vi.fn(() => of(undefined));
      await setUp('abc123', confirmEmail);

      expect(confirmEmail).toHaveBeenCalledWith('abc123');
      expect(confirmEmail).toHaveBeenCalledTimes(1);
    });

    it('shows the verifying copy before the call settles', async () => {
      // Never-resolving observable — the call is in flight, so the
      // component should still be in the initial `verifying` state.
      await setUp('abc123', vi.fn(() => new Subject<void>()));

      expect(heading()).toBe('Confirming your email…');
    });
  });

  describe('success state', () => {
    it('transitions to success with correct messaging on a successful response', async () => {
      await setUp('abc123', vi.fn(() => of(undefined)));

      expect(heading()).toBe('Email confirmed');
      expect(root().textContent).toContain('verified');
    });

    it('navigates to /login when continuing from the success state', async () => {
      await setUp('abc123', vi.fn(() => of(undefined)));

      const continueButton = root().querySelector('button.ew-auth-submit') as HTMLButtonElement;
      continueButton.click();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('invalid-or-expired state', () => {
    it('transitions to invalid-or-expired on an INVALID_OR_EXPIRED_TOKEN failure', async () => {
      const confirmEmail = vi.fn(() =>
        throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired link or code.')),
      );
      await setUp('bad-token', confirmEmail);

      expect(heading()).toBe("This link isn't valid");
    });

    it('does not attempt to distinguish why the token failed in its messaging', async () => {
      const confirmEmail = vi.fn(() =>
        throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired link or code.')),
      );
      await setUp('bad-token', confirmEmail);

      const text = root().textContent ?? '';
      expect(text).toContain('invalid or has expired');
      // No frontend-invented specificity beyond the backend's own generic code.
      expect(text.toLowerCase()).not.toContain('already used');
      expect(text.toLowerCase()).not.toContain('already confirmed');
      expect(text.toLowerCase()).not.toContain('wrong purpose');
    });

    it('shows an email input and resend action', async () => {
      await setUp(
        'bad-token',
        vi.fn(() => throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x'))),
      );

      expect(resendEmailInput()).not.toBeNull();
      expect(resendSubmitButton()).not.toBeNull();
    });

    it('calls resendConfirmation with the typed email on submit', async () => {
      const resendConfirmation = vi.fn(() => of(undefined));
      await setUp(
        'bad-token',
        vi.fn(() => throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x'))),
        resendConfirmation,
      );

      const input = resendEmailInput()!;
      input.value = 'user@example.com';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      resendSubmitButton()!.click();

      expect(resendConfirmation).toHaveBeenCalledWith('user@example.com');
    });

    it('does not call resendConfirmation with an invalid/empty email', async () => {
      const resendConfirmation = vi.fn(() => of(undefined));
      await setUp(
        'bad-token',
        vi.fn(() => throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x'))),
        resendConfirmation,
      );

      resendSubmitButton()!.click();

      expect(resendConfirmation).not.toHaveBeenCalled();
    });

    /**
     * Same always-generic message string asserted on both branches below —
     * kept as one constant so a future edit to the copy can't accidentally
     * make the two branches diverge without the test catching it.
     */
    const GENERIC_RESEND_MESSAGE = "If your account needs verification, we've sent a new email.";

    it('shows the generic resend message on a successful resend (anti-enumeration)', async () => {
      const resendConfirmation = vi.fn(() => of(undefined));
      await setUp(
        'bad-token',
        vi.fn(() => throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x'))),
        resendConfirmation,
      );

      const input = resendEmailInput()!;
      input.value = 'user@example.com';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      resendSubmitButton()!.click();
      fixture.detectChanges();

      const message = root().querySelector('.ew-confirm-email-success')?.textContent?.trim();
      expect(message).toBe(GENERIC_RESEND_MESSAGE);
    });

    it('shows the identical generic resend message on a failed resend, e.g. RATE_LIMITED (anti-enumeration)', async () => {
      const resendConfirmation = vi.fn(() =>
        throwError(() => new AuthError('RATE_LIMITED', 'Too many attempts. Please try again later.')),
      );
      await setUp(
        'bad-token',
        vi.fn(() => throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x'))),
        resendConfirmation,
      );

      const input = resendEmailInput()!;
      input.value = 'user@example.com';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      resendSubmitButton()!.click();
      fixture.detectChanges();

      const message = root().querySelector('.ew-confirm-email-success')?.textContent?.trim();
      expect(message).toBe(GENERIC_RESEND_MESSAGE);
    });

    it('navigates to /login from the "back to sign in" link', async () => {
      await setUp(
        'bad-token',
        vi.fn(() => throwError(() => new AuthError('INVALID_OR_EXPIRED_TOKEN', 'x'))),
      );

      const link = root().querySelector('.ew-auth-hint a') as HTMLElement;
      link.click();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('no token in URL', () => {
    it('goes straight to invalid-or-expired without calling confirmEmail', async () => {
      const confirmEmail = vi.fn(() => of(undefined));
      await setUp(null, confirmEmail);

      expect(confirmEmail).not.toHaveBeenCalled();
      expect(heading()).toBe("This link isn't valid");
    });
  });
});
