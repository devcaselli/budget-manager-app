import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { AuthError } from '@core/auth/auth.model';

import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let authService: { isAuthenticated: () => boolean; login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
  let router: Router;

  async function setUp(isAuthenticated = false): Promise<void> {
    authService = {
      isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
      login: vi.fn(),
      register: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  describe('rendered content — the page contributes only tabs/forms, no wrapper markup', () => {
    beforeEach(async () => {
      await setUp();
    });

    it('does not render its own .ew-auth / .ew-auth-hero wrapper (owned by AuthShellComponent)', () => {
      expect(root().querySelector('.ew-auth')).toBeFalsy();
      expect(root().querySelector('.ew-auth-hero')).toBeFalsy();
    });

    it('renders the tab switcher with Sign in / Create account tabs', () => {
      const tabs = root().querySelectorAll('.ew-auth-tabs [role="tab"]');
      expect(tabs.length).toBe(2);
      expect(tabs[0].textContent?.trim()).toBe('Sign in');
      expect(tabs[1].textContent?.trim()).toBe('Create account');
    });

    it('shows the login form by default', () => {
      expect(root().querySelector('#login-email')).toBeTruthy();
      expect(root().querySelector('#login-password')).toBeTruthy();
      expect(root().querySelector('#signup-email')).toBeFalsy();
    });

    it('switches to the signup form when the Create account tab is clicked', () => {
      const signupTab = root().querySelectorAll('.ew-auth-tabs [role="tab"]')[1] as HTMLElement;
      signupTab.click();
      fixture.detectChanges();

      expect(root().querySelector('#signup-email')).toBeTruthy();
      expect(root().querySelector('#login-email')).toBeFalsy();
    });
  });

  describe('redirect on init', () => {
    it('navigates to /dashboard when already authenticated', async () => {
      await setUp(true);
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('does not navigate when not authenticated', async () => {
      await setUp(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('login submit', () => {
    beforeEach(async () => {
      await setUp();
    });

    it('shows a validation error and does not call the service when the form is invalid', () => {
      const form = root().querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(authService.login).not.toHaveBeenCalled();
      expect(root().querySelector('.ew-auth-err')?.textContent).toContain(
        'Please enter a valid email and password.',
      );
    });

    it('calls AuthService.login and navigates to /dashboard on success', () => {
      authService.login.mockReturnValue(of(undefined));

      const email = root().querySelector('#login-email') as HTMLInputElement;
      const password = root().querySelector('#login-password') as HTMLInputElement;
      email.value = 'user@example.com';
      email.dispatchEvent(new Event('input'));
      password.value = 'secretpw';
      password.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = root().querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(authService.login).toHaveBeenCalledWith('user@example.com', 'secretpw');
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('surfaces the AuthError message on failure', () => {
      authService.login.mockReturnValue(
        throwError(() => new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.')),
      );

      const email = root().querySelector('#login-email') as HTMLInputElement;
      const password = root().querySelector('#login-password') as HTMLInputElement;
      email.value = 'user@example.com';
      email.dispatchEvent(new Event('input'));
      password.value = 'secretpw';
      password.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = root().querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(root().querySelector('.ew-auth-err')?.textContent).toContain(
        'Invalid email or password.',
      );
    });
  });
});
