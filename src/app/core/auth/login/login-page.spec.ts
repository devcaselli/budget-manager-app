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

  describe('signup submit — display name field (F-B2)', () => {
    function switchToSignup(): void {
      const signupTab = root().querySelectorAll('.ew-auth-tabs [role="tab"]')[1] as HTMLElement;
      signupTab.click();
      fixture.detectChanges();
    }

    function setInput(selector: string, value: string): void {
      const input = root().querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    function fillValidPasswordFields(): void {
      setInput('#signup-password', 'Secretpw1!');
      setInput('#signup-confirm', 'Secretpw1!');
    }

    function submit(): void {
      const form = root().querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    }

    beforeEach(async () => {
      await setUp();
      switchToSignup();
    });

    it('renders the display name field as the first field, above email', () => {
      const nameField = root().querySelector('#signup-display-name');
      expect(nameField).toBeTruthy();

      const fields = Array.from(root().querySelectorAll('input[formControlName]'));
      const fieldIds = fields.map((el) => el.id);
      expect(fieldIds.indexOf('signup-display-name')).toBeLessThan(fieldIds.indexOf('signup-email'));
    });

    it('blocks submit and shows a page-level error when the name is blank', () => {
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).not.toHaveBeenCalled();
      expect(root().querySelector('.ew-auth-err')?.textContent).toContain(
        'Please fill in all fields correctly.',
      );
    });

    it('blocks submit when the name is only whitespace (trims to blank)', () => {
      setInput('#signup-display-name', '   ');
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).not.toHaveBeenCalled();
      expect(root().querySelector('.ew-auth-err')?.textContent).toContain(
        'Please fill in all fields correctly.',
      );
    });

    it('rejects a too-short name (1 char, below the backend min of 2)', () => {
      setInput('#signup-display-name', 'A');
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('rejects a too-long name (51 chars, above the backend max of 50)', () => {
      setInput('#signup-display-name', 'A'.repeat(51));
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('accepts a name with accents, hyphens, spaces, and an apostrophe (no letters-only regex)', () => {
      authService.register.mockReturnValue(of(undefined));

      setInput('#signup-display-name', "José D'Ávila-Núñez Österberg");
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).toHaveBeenCalledWith(
        'user@example.com',
        'Secretpw1!',
        "José D'Ávila-Núñez Österberg",
      );
    });

    it('trims leading/trailing whitespace from the name before submitting', () => {
      authService.register.mockReturnValue(of(undefined));

      setInput('#signup-display-name', '  Jean-Paul  ');
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).toHaveBeenCalledWith('user@example.com', 'Secretpw1!', 'Jean-Paul');
    });

    it('calls AuthService.register with the trimmed name and navigates to /dashboard on success', () => {
      authService.register.mockReturnValue(of(undefined));

      setInput('#signup-display-name', 'Ana Silva');
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(authService.register).toHaveBeenCalledWith('user@example.com', 'Secretpw1!', 'Ana Silva');
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('surfaces the AuthError message on register failure', () => {
      authService.register.mockReturnValue(
        throwError(() => new AuthError('RATE_LIMITED', 'Too many attempts. Please try again later.')),
      );

      setInput('#signup-display-name', 'Ana Silva');
      setInput('#signup-email', 'user@example.com');
      fillValidPasswordFields();
      submit();

      expect(root().querySelector('.ew-auth-err')?.textContent).toContain(
        'Too many attempts. Please try again later.',
      );
    });
  });
});
