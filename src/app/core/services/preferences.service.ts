import { Injectable, signal } from '@angular/core';

/** Browser localStorage when available (guards non-browser/test environments without it). */
const storage: Storage | null =
  typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
    ? localStorage
    : null;

function readStored(key: string): string | null {
  return storage?.getItem(key) ?? null;
}

function writeStored(key: string, value: string | null): void {
  if (!storage) return;
  if (value === null) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, value);
  }
}

function bodyHasClass(className: string): boolean {
  return typeof document !== 'undefined' && !!document.body?.classList.contains(className);
}

/**
 * Shared user preferences — persisted in localStorage, reactive via signals.
 * Single source of truth for Shell + Settings page.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly darkTheme = signal(readStored('bm_theme') !== 'light');
  readonly privacyMode = signal(bodyHasClass('ew-privacy'));
  readonly centeredLayout = signal(readStored('bm_layout') === 'centered');
  readonly showTweaks = signal(readStored('bm_tweaks') !== 'hidden');
  readonly featureFlags = signal(readStored('bm_flags') === 'on');
  /** Wallet to auto-select on load/refresh; null when none is starred. */
  readonly favoriteWalletId = signal<string | null>(readStored('bm_favorite_wallet'));

  toggleDarkTheme(): void {
    const next = !this.darkTheme();
    this.darkTheme.set(next);
    if (typeof document !== 'undefined') document.body?.classList.toggle('ew-light', !next);
    writeStored('bm_theme', next ? 'dark' : 'light');
  }

  togglePrivacy(): void {
    const next = !this.privacyMode();
    this.privacyMode.set(next);
    if (typeof document !== 'undefined') document.body?.classList.toggle('ew-privacy', next);
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
