import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthError } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { PreferencesService } from '@core/services/preferences.service';
import { trimmedLengthValidator } from '@shared/validators/trimmed-length.validator';

type Tab = 'user' | 'security' | 'system';

interface PwRules {
  len: boolean;
  upper: boolean;
  lower: boolean;
  num: boolean;
  sym: boolean;
  match: boolean;
}

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  protected readonly prefs = inject(PreferencesService);

  // ── Tabs ────────────────────────────────────────────────────────────────────
  protected readonly activeTab = signal<Tab>('user');

  // ── User info ───────────────────────────────────────────────────────────────
  protected readonly userEmail = signal('');

  // ── Profile form ────────────────────────────────────────────────────────────
  // `name` validators mirror the signup form's displayName field exactly (F-B2,
  // login-page.ts) and the backend contract (PATCH /users/me, F-B3): min 2 /
  // max 50 chars after trim, no letters-only restriction — real names have
  // accents, hyphens, spaces, apostrophes.
  //
  // Uses the same shared `trimmedLengthValidator` as the signup form so
  // whitespace-only (or under-minimum-after-trim) input is rejected live —
  // `.invalid` reflects the trimmed reality that will actually be submitted,
  // driving both the inline error message and the Save button's [disabled].
  protected readonly profileForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [trimmedLengthValidator(2, 50)],
    }),
    // No validators: the control is permanently `disabled`, and `saveProfile()`
    // reads `name` directly and builds `{ displayName }` explicitly rather than
    // calling `getRawValue()` — email can never reach the request body, so an
    // `Validators.email` here would be dead code regardless of disabled state.
    email: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
  });

  protected readonly profileSaving = signal(false);
  protected readonly profileError = signal('');
  protected readonly profileSaved = signal(false);

  /** Last name loaded from the account, used to revert on Cancel (not a blank reset). */
  private lastLoadedName = '';

  // ── Password form ────────────────────────────────────────────────────────────
  protected readonly newPw = signal('');
  protected readonly confirmPw = signal('');

  protected readonly passwordForm = new FormGroup({
    current: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    newPw: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly pwRules = computed<PwRules>(() => {
    const pw = this.newPw();
    const conf = this.confirmPw();
    return {
      len:   pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      num:   /[0-9]/.test(pw),
      sym:   /[^A-Za-z0-9]/.test(pw),
      match: pw.length > 0 && pw === conf,
    };
  });

  protected readonly pwStrength = computed(() => {
    const r = this.pwRules();
    const score = [r.len, r.upper, r.lower, r.num, r.sym].filter(Boolean).length;
    return score; // 0-5
  });

  protected readonly pwStrengthWidth = computed(() => `${this.pwStrength() * 20}%`);

  protected readonly pwStrengthColor = computed(() => {
    const s = this.pwStrength();
    if (s <= 2) return 'var(--ew-bad)';
    if (s <= 3) return '#e8a03a';
    return 'var(--ew-teal)';
  });


  // ── 2FA (UI only — no backend yet) ──────────────────────────────────────────
  protected readonly mfaApp = signal(false);
  protected readonly mfaSms = signal(false);

  // ── Delete account dialog ───────────────────────────────────────────────────
  protected readonly showDeleteDialog = signal(false);
  protected readonly deleteEmailInput = signal('');
  protected readonly deleteConfirmEnabled = computed(
    () => this.deleteEmailInput() === this.userEmail(),
  );

  constructor() {
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        const email = user?.email ?? '';
        this.userEmail.set(email);
        this.lastLoadedName = user?.name ?? '';
        this.profileForm.patchValue({ email, name: this.lastLoadedName });
      });

    // Bridge password fields to signals for computed pwRules
    this.passwordForm.controls.newPw.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.newPw.set(v));

    this.passwordForm.controls.confirm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.confirmPw.set(v));
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  // ── Profile ─────────────────────────────────────────────────────────────────
  protected saveProfile(): void {
    // `trimmedLengthValidator` makes `.invalid` itself reflect the trimmed
    // reality (whitespace-only and under-minimum-after-trim are both caught
    // here, matching the signup form's guard and the backend's @NotBlank/@Size).
    if (this.profileForm.controls.name.invalid) {
      this.profileError.set('Name must be between 2 and 50 characters.');
      this.profileSaved.set(false);
      return;
    }

    // Trimmed here only for UX — the backend trims server-side before
    // validation, so this is not required for correctness, but it ensures
    // the displayed value matches exactly what gets persisted.
    const trimmedName = this.profileForm.controls.name.value.trim();

    this.profileSaving.set(true);
    this.profileError.set('');
    this.profileSaved.set(false);

    this.authService
      .updateProfile(trimmedName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.profileSaving.set(false);
          this.profileSaved.set(true);
          this.profileForm.controls.name.setValue(trimmedName);
        },
        error: (err: AuthError) => {
          this.profileSaving.set(false);
          this.profileError.set(err.message);
        },
      });
  }

  /**
   * Reverts the name field to the currently-saved account name — NOT a blank
   * reset. `FormGroup.reset()` clears controls to their initial value (`''`),
   * which is the opposite of what "Cancel" should do when a name is already
   * on file.
   */
  protected cancelProfileEdit(): void {
    this.profileForm.patchValue({ name: this.lastLoadedName });
    this.profileError.set('');
    this.profileSaved.set(false);
  }

  // ── Password ─────────────────────────────────────────────────────────────────
  protected updatePassword(): void {
    const r = this.pwRules();
    const allValid = r.len && r.upper && r.lower && r.num && r.sym && r.match;
    if (!allValid || !this.passwordForm.valid) return;
    // TODO: wire to backend PATCH /users/me/password when available
  }

  // ── System toggles — delegated to PreferencesService ────────────────────────
  protected toggleDarkTheme(): void { this.prefs.toggleDarkTheme(); }
  protected togglePrivacy(): void { this.prefs.togglePrivacy(); }
  protected toggleCenteredLayout(): void { this.prefs.toggleCenteredLayout(); }
  protected toggleShowTweaks(): void { this.prefs.toggleShowTweaks(); }
  protected toggleFeatureFlags(): void { this.prefs.toggleFeatureFlags(); }

  // ── 2FA ──────────────────────────────────────────────────────────────────────
  protected toggleMfaApp(): void {
    this.mfaApp.update((v) => !v);
    // TODO: wire to backend when available
  }

  protected toggleMfaSms(): void {
    this.mfaSms.update((v) => !v);
    // TODO: wire to backend when available
  }

  // ── Delete account ───────────────────────────────────────────────────────────
  protected openDeleteDialog(): void {
    this.deleteEmailInput.set('');
    this.showDeleteDialog.set(true);
  }

  protected closeDeleteDialog(): void {
    this.showDeleteDialog.set(false);
  }

  protected confirmDeleteAccount(): void {
    if (!this.deleteConfirmEnabled()) return;
    // TODO: wire to backend DELETE /users/me when available
    this.authService.logout();
  }
}
