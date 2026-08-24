import { Injectable, signal } from '@angular/core';

/**
 * Resolves `localStorage` when available (guards non-browser/test environments
 * without it). Deliberately NOT cached at module scope — this module can be
 * imported before a test environment installs its storage stub (e.g. Vitest's
 * `vi.stubGlobal`), and a stale `null` snapshot would silently disable
 * persistence for the rest of the suite.
 */
function getStorage(): Storage | null {
  return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
    ? localStorage
    : null;
}

function readStored(key: string): string | null {
  return getStorage()?.getItem(key) ?? null;
}

function writeStored(key: string, value: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (value === null) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, value);
  }
}

/**
 * Resolves the boot-time theme per the design's own fallback chain:
 * 1. explicit `bm_theme` in localStorage ('dark' | 'light')
 * 2. OS preference via `prefers-color-scheme`
 * 3. 'light' — the design's own default, used when neither of the above
 *    resolves the question definitively (no stored value, no matchMedia
 *    support, or an SSR/test environment without `window`).
 */
function resolveInitialTheme(): 'dark' | 'light' {
  const stored = readStored('bm_theme');
  if (stored === 'dark' || stored === 'light') return stored;

  if (typeof matchMedia === 'function') {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
}

/**
 * Shared user preferences — persisted in localStorage, reactive via signals.
 * Single source of truth for Shell + Settings page.
 *
 * Also owns the app's theme/privacy boot logic: applying the `[data-theme]`
 * attribute on `<html>` and the `.ew-privacy` class on `<body>` as soon as
 * this service is constructed (it's `providedIn: 'root'`, so the first
 * injection anywhere — e.g. from `ShellComponent`, the app's root layout —
 * triggers it before any theme-dependent view renders).
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly darkTheme = signal(resolveInitialTheme() === 'dark');
  readonly privacyMode = signal(readStored('bm_privacy') === 'on');
  readonly centeredLayout = signal(readStored('bm_layout') === 'centered');
  readonly showTweaks = signal(readStored('bm_tweaks') !== 'hidden');
  readonly featureFlags = signal(readStored('bm_flags') === 'on');
  /** Wallet to auto-select on load/refresh; null when none is starred. */
  readonly favoriteWalletId = signal<string | null>(readStored('bm_favorite_wallet'));

  constructor() {
    this.applyTheme(this.darkTheme());
    this.applyPrivacy(this.privacyMode());
  }

  toggleDarkTheme(): void {
    const next = !this.darkTheme();
    this.darkTheme.set(next);
    this.applyTheme(next);
    writeStored('bm_theme', next ? 'dark' : 'light');
  }

  togglePrivacy(): void {
    const next = !this.privacyMode();
    this.privacyMode.set(next);
    this.applyPrivacy(next);
    writeStored('bm_privacy', next ? 'on' : 'off');
  }

  private applyTheme(dark: boolean): void {
    if (typeof document === 'undefined') return;
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  private applyPrivacy(active: boolean): void {
    if (typeof document === 'undefined') return;
    document.body?.classList.toggle('ew-privacy', active);
  }

  toggleCenteredLayout(): void {
    const next = !this.centeredLayout();
    this.centeredLayout.set(next);
    writeStored('bm_layout', next ? 'centered' : 'full');
  }

  toggleShowTweaks(): void {
    const next = !this.showTweaks();
    this.showTweaks.set(next);
    writeStored('bm_tweaks', next ? 'visible' : 'hidden');
  }

  toggleFeatureFlags(): void {
    const next = !this.featureFlags();
    this.featureFlags.set(next);
    writeStored('bm_flags', next ? 'on' : 'off');
  }

  /** Stars `walletId` as favorite, or clears it when already starred (toggle). */
  toggleFavoriteWallet(walletId: string): void {
    const next = this.favoriteWalletId() === walletId ? null : walletId;
    this.favoriteWalletId.set(next);
    writeStored('bm_favorite_wallet', next);
  }
}
