import { TestBed } from '@angular/core/testing';

import { PreferencesService } from './preferences.service';

/** Minimal in-memory localStorage — the test env does not provide one (same pattern as AuthService's spec). */
function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  const stub: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', stub);
}

/** Clears every key this service reads/writes, plus resets DOM state it applies on boot. */
function resetPreferenceState(): void {
  installLocalStorageStub();
  document.documentElement.removeAttribute('data-theme');
  document.body.classList.remove('ew-privacy');
}

/** Stubs `matchMedia` so tests control the OS dark-preference fallback deterministically. */
function stubPrefersDark(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe('PreferencesService', () => {
  beforeEach(() => {
    // Fresh injector per test: PreferencesService reads localStorage/matchMedia
    // in its constructor, so a service instance carried over from a previous
    // test (root DI is otherwise a singleton for the whole spec file) would
    // never re-run boot resolution against this test's stubbed state.
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.body.classList.remove('ew-privacy');
  });

  describe('theme resolution (boot)', () => {
    it('defaults to light when localStorage has no bm_theme and OS has no dark preference', () => {
      resetPreferenceState();
      stubPrefersDark(false);

      const service = TestBed.inject(PreferencesService);

      expect(service.darkTheme()).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('falls back to the OS dark preference when localStorage has no bm_theme', () => {
      resetPreferenceState();
      stubPrefersDark(true);

      const service = TestBed.inject(PreferencesService);

      expect(service.darkTheme()).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('prefers a stored bm_theme over the OS preference', () => {
      resetPreferenceState();
      localStorage.setItem('bm_theme', 'light');
      stubPrefersDark(true);

      const service = TestBed.inject(PreferencesService);

      expect(service.darkTheme()).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('boots with [data-theme="dark"] when bm_theme is stored as dark', () => {
      resetPreferenceState();
      localStorage.setItem('bm_theme', 'dark');
      stubPrefersDark(false);

      const service = TestBed.inject(PreferencesService);

      expect(service.darkTheme()).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('toggling theme flips the [data-theme] attribute and persists the choice', () => {
      resetPreferenceState();
      stubPrefersDark(false);
      const service = TestBed.inject(PreferencesService);

      service.toggleDarkTheme();

      expect(service.darkTheme()).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(localStorage.getItem('bm_theme')).toBe('dark');

      service.toggleDarkTheme();

      expect(service.darkTheme()).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
      expect(localStorage.getItem('bm_theme')).toBe('light');
    });
  });

  describe('privacyMode persistence', () => {
    it('defaults to off when nothing is stored', () => {
      resetPreferenceState();

      const service = TestBed.inject(PreferencesService);

      expect(service.privacyMode()).toBe(false);
      expect(document.body.classList.contains('ew-privacy')).toBe(false);
    });

    it('restores privacyMode from bm_privacy on boot (fixes the pre-D1 bug where it never persisted)', () => {
      resetPreferenceState();
      localStorage.setItem('bm_privacy', 'on');

      const service = TestBed.inject(PreferencesService);

      expect(service.privacyMode()).toBe(true);
      expect(document.body.classList.contains('ew-privacy')).toBe(true);
    });

    it('togglePrivacy writes bm_privacy to localStorage so the state survives a refresh', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.togglePrivacy();

      expect(service.privacyMode()).toBe(true);
      expect(localStorage.getItem('bm_privacy')).toBe('on');
      expect(document.body.classList.contains('ew-privacy')).toBe(true);

      service.togglePrivacy();

      expect(service.privacyMode()).toBe(false);
      expect(localStorage.getItem('bm_privacy')).toBe('off');
      expect(document.body.classList.contains('ew-privacy')).toBe(false);
    });
  });

  describe('sidebar nav-group collapse (D4)', () => {
    it('defaults to all groups open (empty map) when nothing is stored', () => {
      resetPreferenceState();

      const service = TestBed.inject(PreferencesService);

      expect(service.closedNavGroups()).toEqual({});
    });

    it('toggleNavGroup closes an open group and persists it', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.toggleNavGroup('LEDGER');

      expect(service.closedNavGroups()).toEqual({ LEDGER: true });
      expect(JSON.parse(localStorage.getItem('bm_nav_closed') ?? 'null')).toEqual({ LEDGER: true });
    });

    it('toggleNavGroup reopens an already-closed group', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.toggleNavGroup('LEDGER');
      service.toggleNavGroup('LEDGER');

      expect(service.closedNavGroups()).toEqual({});
      expect(JSON.parse(localStorage.getItem('bm_nav_closed') ?? 'null')).toEqual({});
    });

    it('restores closed groups from bm_nav_closed on boot', () => {
      resetPreferenceState();
      localStorage.setItem('bm_nav_closed', JSON.stringify({ MANAGER: true }));

      const service = TestBed.inject(PreferencesService);

      expect(service.closedNavGroups()).toEqual({ MANAGER: true });
    });

    it('falls back to all-open when bm_nav_closed holds malformed JSON', () => {
      resetPreferenceState();
      localStorage.setItem('bm_nav_closed', '{not json');

      const service = TestBed.inject(PreferencesService);

      expect(service.closedNavGroups()).toEqual({});
    });
  });

  describe('desktop sidebar collapse (D4)', () => {
    it('defaults to visible (not hidden) when nothing is stored', () => {
      resetPreferenceState();

      const service = TestBed.inject(PreferencesService);

      expect(service.sidebarHidden()).toBe(false);
    });

    it('toggleSidebarHidden flips state and persists it across boot', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.toggleSidebarHidden();

      expect(service.sidebarHidden()).toBe(true);
      expect(localStorage.getItem('bm_sidebar_hidden')).toBe('on');

      service.toggleSidebarHidden();

      expect(service.sidebarHidden()).toBe(false);
      expect(localStorage.getItem('bm_sidebar_hidden')).toBe('off');
    });

    it('restores sidebarHidden from bm_sidebar_hidden on boot', () => {
      resetPreferenceState();
      localStorage.setItem('bm_sidebar_hidden', 'on');

      const service = TestBed.inject(PreferencesService);

      expect(service.sidebarHidden()).toBe(true);
    });
  });

  describe('remembered credit card (P2-4)', () => {
    it('defaults rememberCard to off and rememberedCreditCardId to null when nothing is stored', () => {
      resetPreferenceState();

      const service = TestBed.inject(PreferencesService);

      expect(service.rememberCard()).toBe(false);
      expect(service.rememberedCreditCardId()).toBeNull();
    });

    it('toggleRememberCard flips state and persists it across boot', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.toggleRememberCard();

      expect(service.rememberCard()).toBe(true);
      expect(localStorage.getItem('bm_remember_card')).toBe('on');

      service.toggleRememberCard();

      expect(service.rememberCard()).toBe(false);
      expect(localStorage.getItem('bm_remember_card')).toBe('off');
    });

    it('setRememberedCreditCardId persists the id and restores it on boot', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.setRememberedCreditCardId('card-1');

      expect(service.rememberedCreditCardId()).toBe('card-1');
      expect(localStorage.getItem('bm_remembered_credit_card_id')).toBe('card-1');

      TestBed.resetTestingModule();
      const rebooted = TestBed.inject(PreferencesService);

      expect(rebooted.rememberedCreditCardId()).toBe('card-1');
    });

    it('toggling rememberCard off does not clear the previously remembered card id', () => {
      resetPreferenceState();
      const service = TestBed.inject(PreferencesService);

      service.setRememberedCreditCardId('card-1');
      service.toggleRememberCard();

      expect(service.rememberCard()).toBe(true);
      expect(service.rememberedCreditCardId()).toBe('card-1');

      service.toggleRememberCard();

      expect(service.rememberCard()).toBe(false);
      expect(service.rememberedCreditCardId()).toBe('card-1');
    });
  });
});
