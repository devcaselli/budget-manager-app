import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';

import { CheckEmailPage } from './check-email-page';

describe('CheckEmailPage', () => {
  let fixture: ComponentFixture<CheckEmailPage>;
  let authService: { resendConfirmation: ReturnType<typeof vi.fn> };
  let router: Router;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function resendButton(): HTMLButtonElement {
    return root().querySelector('button.ew-auth-submit') as HTMLButtonElement;
  }

  /**
   * Builds the component directly (bypassing router navigation state
   * entirely) with `history.state` pre-seeded — the same mechanism
   * `CheckEmailPage`'s constructor falls back to. This is the primary setup
   * used by these tests: simpler and more deterministic than trying to coax
   * `Router.getCurrentNavigation()` out of a test harness, while still
   * exercising the real code path (`history.state` read in the constructor).
   */
  async function setUpWithHistoryState(
    email: string | null,
    resendConfirmation: ReturnType<typeof vi.fn> = vi.fn(),
  ): Promise<void> {
    authService = { resendConfirmation };

    if (email) {
      history.replaceState({ email }, '');
    } else {
      history.replaceState({}, '');
    }

    await TestBed.configureTestingModule({
      imports: [CheckEmailPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(CheckEmailPage);
    fixture.detectChanges();
  }

  afterEach(() => {
    history.replaceState({}, '');
    vi.useRealTimers();
  });

  describe('initial render', () => {
    it('shows the "check your email" messaging with the handed-off email', async () => {
      await setUpWithHistoryState('user@example.com');

      expect(root().textContent).toContain('Check your email');
      expect(root().textContent).toContain('user@example.com');
    });

    it('still renders the generic messaging when no email was handed off', async () => {
      await setUpWithHistoryState(null);

      expect(root().textContent).toContain('Check your email');
      expect(root().textContent).toContain('We sent you a confirmation link');
    });

    it('communicates the screen is not a hard gate', async () => {
      await setUpWithHistoryState('user@example.com');

      expect(root().textContent).toContain("You can keep using the app right away");
    });
  });

  describe('resend action', () => {
    it('calls AuthService.resendConfirmation with the handed-off email', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();

      expect(authService.resendConfirmation).toHaveBeenCalledWith('user@example.com');
    });

    it('does not call resendConfirmation when no email is available', async () => {
      await setUpWithHistoryState(null, vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();

      expect(authService.resendConfirmation).not.toHaveBeenCalled();
    });

    it('shows the same generic success message on a real success response', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();

      expect(root().textContent).toContain(
        "If your account needs verification, we've sent a new email.",
      );
    });

    it('shows the exact same generic message even when the call errors (anti-enumeration discipline)', async () => {
      await setUpWithHistoryState(
        'user@example.com',
        vi.fn().mockReturnValue(throwError(() => new AuthError('RATE_LIMITED', 'Too many attempts.'))),
      );

      resendButton().click();
      fixture.detectChanges();

      // Same copy as the success path above — the UI must never distinguish
      // "sent", "already verified", or a genuine backend error in its message.
      expect(root().textContent).toContain(
        "If your account needs verification, we've sent a new email.",
      );
    });
  });

  describe('60s cooldown (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('disables the resend button immediately after a resend click and shows a countdown', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();

      expect(resendButton().disabled).toBe(true);
      expect(resendButton().textContent).toContain('Resend in 60s');
    });

    it('counts down and does not re-enable before 60s have elapsed', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(30_000);
      fixture.detectChanges();

      expect(resendButton().disabled).toBe(true);
      expect(resendButton().textContent).toContain('Resend in 30s');
    });

    it('re-enables the resend button once the 60s cooldown fully elapses', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(60_000);
      fixture.detectChanges();

      expect(resendButton().disabled).toBe(false);
      expect(resendButton().textContent).toContain('Resend email');
    });

    it('does not let a second click during the cooldown trigger another call', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();
      resendButton().click();
      fixture.detectChanges();

      expect(authService.resendConfirmation).toHaveBeenCalledTimes(1);
    });

    it('does not throw when the cooldown timer fires after the component is destroyed', async () => {
      await setUpWithHistoryState('user@example.com', vi.fn().mockReturnValue(of(undefined)));

      resendButton().click();
      fixture.detectChanges();
      fixture.destroy();

      await expect(vi.advanceTimersByTimeAsync(60_000)).resolves.not.toThrow();
    });
  });

  describe('skip / dismiss', () => {
    it('navigates to /dashboard when "Skip for now" is activated', async () => {
      await setUpWithHistoryState('user@example.com');

      const skipLink = root().querySelector('.ew-auth-hint a') as HTMLElement;
      skipLink.click();
      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('offers the skip path even when no email was handed off (never traps the user)', async () => {
      await setUpWithHistoryState(null);

      const skipLink = root().querySelector('.ew-auth-hint a') as HTMLElement;
      expect(skipLink).toBeTruthy();

      skipLink.click();
      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });
});
