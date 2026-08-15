import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { AuthError, AuthUser } from '@core/auth/auth.model';

import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let component: SettingsPage;
  let currentUser$: BehaviorSubject<AuthUser | null>;
  let authService: {
    currentUser$: BehaviorSubject<AuthUser | null>;
    updateProfile: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return { email: 'jane@mail.com', name: 'Jane Doe', initials: 'J', ...overrides };
  }

  async function setUp(user: AuthUser | null = makeUser()): Promise<void> {
    currentUser$ = new BehaviorSubject<AuthUser | null>(user);
    authService = {
      currentUser$,
      updateProfile: vi.fn(),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  describe('initial state', () => {
    it('seeds the profile form with the current user name and email', async () => {
      await setUp(makeUser({ name: 'Jane Doe', email: 'jane@mail.com' }));

      expect(component['profileForm'].controls.name.value).toBe('Jane Doe');
      expect(component['profileForm'].controls.email.value).toBe('jane@mail.com');
    });

    it('seeds an empty name when the user has none on file', async () => {
      await setUp(makeUser({ name: null }));

      expect(component['profileForm'].controls.name.value).toBe('');
    });

    it('keeps the email field disabled — email changes are out of scope', async () => {
      await setUp();

      expect(component['profileForm'].controls.email.disabled).toBe(true);
      const emailInput = root().querySelector('input[formcontrolname="email"]') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(true);
    });

    it('renders the Save changes button enabled (no longer the disabled/backend-unavailable stub)', async () => {
      await setUp();

      const submitBtn = root().querySelector('.set-form button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);
      expect(submitBtn.title).not.toBe('Backend not yet available');
    });
  });

  describe('client-side validation', () => {
    it('rejects a blank name without calling the backend', async () => {
      await setUp();
      component['profileForm'].controls.name.setValue('');

      component['saveProfile']();

      expect(authService.updateProfile).not.toHaveBeenCalled();
    });

    it('rejects a name shorter than 2 characters', async () => {
      await setUp();
      component['profileForm'].controls.name.setValue('A');

      component['saveProfile']();

      expect(authService.updateProfile).not.toHaveBeenCalled();
      expect(component['profileForm'].controls.name.invalid).toBe(true);
    });

    it('rejects a name longer than 50 characters', async () => {
      await setUp();
      component['profileForm'].controls.name.setValue('A'.repeat(51));

      component['saveProfile']();

      expect(authService.updateProfile).not.toHaveBeenCalled();
      expect(component['profileForm'].controls.name.invalid).toBe(true);
    });

    it('accepts names with accents, hyphens, spaces and apostrophes (no letters-only pattern)', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(of(undefined));
      component['profileForm'].controls.name.setValue("Jean-Luc O'Connor Ångström");

      component['saveProfile']();

      expect(authService.updateProfile).toHaveBeenCalledWith("Jean-Luc O'Connor Ångström");
    });

    // review MAJOR-1: whitespace-only (and under-minimum-after-trim) input must
    // be rejected client-side, before any HTTP call — mirrors login-page.spec.ts's
    // equivalent signup-form coverage.
    it('rejects a whitespace-only name without calling the backend (review MAJOR-1)', async () => {
      await setUp();
      component['profileForm'].controls.name.setValue('   ');

      component['saveProfile']();

      expect(authService.updateProfile).not.toHaveBeenCalled();
      expect(component['profileForm'].controls.name.invalid).toBe(true);
      expect(component['profileError']()).toBe('Name must be between 2 and 50 characters.');
    });

    it('rejects a name that trims below the 2-char minimum (" A ") without calling the backend (review MAJOR-1)', async () => {
      await setUp();
      component['profileForm'].controls.name.setValue(' A ');

      component['saveProfile']();

      expect(authService.updateProfile).not.toHaveBeenCalled();
      expect(component['profileForm'].controls.name.invalid).toBe(true);
    });
  });

  // review MAJOR-2: the live UI (error message + Save button) must honestly
  // reflect whitespace-only input as invalid, not just the submit-time guard.
  describe('live UI feedback for whitespace-only input (review MAJOR-2)', () => {
    function nameInput(): HTMLInputElement {
      return root().querySelector('input[formcontrolname="name"]') as HTMLInputElement;
    }

    function saveButton(): HTMLButtonElement {
      return root().querySelector('.set-form button[type="submit"]') as HTMLButtonElement;
    }

    it('shows the inline error and disables Save once a whitespace-only name is touched', async () => {
      await setUp();

      const input = nameInput();
      input.value = '   ';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(component['profileForm'].controls.name.invalid).toBe(true);
      expect(root().querySelector('.set-field-err')?.textContent).toContain(
        'Name must be between 2 and 50 characters.',
      );
      expect(saveButton().disabled).toBe(true);
    });
  });

  describe('successful save', () => {
    it('calls AuthService.updateProfile with the trimmed name', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(of(undefined));
      component['profileForm'].controls.name.setValue('  New Name  ');

      component['saveProfile']();

      expect(authService.updateProfile).toHaveBeenCalledWith('New Name');
    });

    it('shows saving state while the request is in flight, then success feedback', async () => {
      await setUp();
      const subject = new Subject<void>();
      authService.updateProfile.mockReturnValue(subject.asObservable());
      component['profileForm'].controls.name.setValue('New Name');

      component['saveProfile']();
      fixture.detectChanges();
      expect(component['profileSaving']()).toBe(true);
      expect(root().querySelector('.set-form button[type="submit"]')?.textContent?.trim()).toBe('Saving…');

      subject.next();
      subject.complete();
      fixture.detectChanges();

      expect(component['profileSaving']()).toBe(false);
      expect(component['profileSaved']()).toBe(true);
      expect(root().querySelector('.set-success')?.textContent).toContain('Profile updated.');
    });

    it('does not require a page reload — the displayed value updates from component state directly', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(of(undefined));
      component['profileForm'].controls.name.setValue('New Name');

      component['saveProfile']();
      fixture.detectChanges();

      const nameInput = root().querySelector('input[formcontrolname="name"]') as HTMLInputElement;
      expect(nameInput.value).toBe('New Name');
    });
  });

  // review m-2: Cancel must revert to the currently-saved name, not clear the field.
  describe('cancel', () => {
    it('reverts the name field to the current account name rather than clearing it', async () => {
      await setUp(makeUser({ name: 'Jane Doe' }));
      component['profileForm'].controls.name.setValue('Some unsaved edit');

      const cancelBtn = root().querySelector('.ew-btn--ghost') as HTMLButtonElement;
      cancelBtn.click();
      fixture.detectChanges();

      expect(component['profileForm'].controls.name.value).toBe('Jane Doe');
    });
  });

  describe('error handling', () => {
    it('shows an error message on a 400 validation failure and does not get stuck saving', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(
        throwError(() => new AuthError('UNKNOWN', 'Something went wrong. Please try again.')),
      );
      component['profileForm'].controls.name.setValue('New Name');

      component['saveProfile']();
      fixture.detectChanges();

      expect(component['profileSaving']()).toBe(false);
      expect(component['profileError']()).toBe('Something went wrong. Please try again.');
      expect(component['profileSaved']()).toBe(false);
      expect(root().querySelector('.ew-alert')?.textContent).toContain('Something went wrong. Please try again.');

      const submitBtn = root().querySelector('.set-form button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);
    });

    it('shows a session-expired message on a 401 (UNAUTHORIZED) error', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(
        throwError(() => new AuthError('UNAUTHORIZED', 'Session expired.')),
      );
      component['profileForm'].controls.name.setValue('New Name');

      component['saveProfile']();
      fixture.detectChanges();

      expect(component['profileError']()).toBe('Session expired.');
      expect(component['profileSaving']()).toBe(false);
    });

    it('shows a generic error on a network failure (UNKNOWN) without crashing', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(
        throwError(() => new AuthError('UNKNOWN', 'Something went wrong. Please try again.')),
      );
      component['profileForm'].controls.name.setValue('New Name');

      expect(() => {
        component['saveProfile']();
        fixture.detectChanges();
      }).not.toThrow();

      expect(component['profileError']()).toBe('Something went wrong. Please try again.');
    });

    it('clears a previous error and success flag when a new save attempt starts', async () => {
      await setUp();
      authService.updateProfile.mockReturnValue(throwError(() => new AuthError('UNKNOWN', 'Failed.')));
      component['profileForm'].controls.name.setValue('New Name');
      component['saveProfile']();
      fixture.detectChanges();
      expect(component['profileError']()).toBe('Failed.');

      authService.updateProfile.mockReturnValue(of(undefined));
      component['saveProfile']();

      expect(component['profileError']()).toBe('');
    });
  });
});
