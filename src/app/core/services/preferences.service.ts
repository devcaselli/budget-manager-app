import { Injectable, signal } from '@angular/core';

/**
 * Shared user preferences — persisted in localStorage, reactive via signals.
 * Single source of truth for Shell + Settings page.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly darkTheme = signal(localStorage.getItem('bm_theme') !== 'light');
  readonly privacyMode = signal(document.body.classList.contains('ew-privacy'));
  readonly centeredLayout = signal(localStorage.getItem('bm_layout') === 'centered');
  readonly showTweaks = signal(localStorage.getItem('bm_tweaks') !== 'hidden');
  readonly featureFlags = signal(localStorage.getItem('bm_flags') === 'on');

  toggleDarkTheme(): void {
    const next = !this.darkTheme();
    this.darkTheme.set(next);
    document.body.classList.toggle('ew-light', !next);
    localStorage.setItem('bm_theme', next ? 'dark' : 'light');
  }

  togglePrivacy(): void {
    const next = !this.privacyMode();
    this.privacyMode.set(next);
    document.body.classList.toggle('ew-privacy', next);
  }

  toggleCenteredLayout(): void {
    const next = !this.centeredLayout();
    this.centeredLayout.set(next);
    localStorage.setItem('bm_layout', next ? 'centered' : 'full');
  }

  toggleShowTweaks(): void {
    const next = !this.showTweaks();
    this.showTweaks.set(next);
    localStorage.setItem('bm_tweaks', next ? 'visible' : 'hidden');
  }

  toggleFeatureFlags(): void {
    const next = !this.featureFlags();
    this.featureFlags.set(next);
    localStorage.setItem('bm_flags', next ? 'on' : 'off');
  }
}
