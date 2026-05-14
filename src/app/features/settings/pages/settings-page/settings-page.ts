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
import { map } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { PreferencesService } from '@core/services/preferences.service';

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
  protected readonly profileForm = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
  });

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
      .pipe(
        map((u) => u?.email ?? ''),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((email) => {
        this.userEmail.set(email);
        this.profileForm.patchValue({ email });
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
    // TODO: wire to backend PATCH /users/me when available
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
