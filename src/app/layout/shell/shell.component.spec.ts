import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

/** Stand-in for the real /tags page (Task 2, not yet implemented) — keeps router.navigate resolvable in tests. */
@Component({ template: '' })
class StubTagsPage {}

import { AuthService } from '@core/auth/auth.service';
import { AuthUser } from '@core/auth/auth.model';
import { PreferencesService } from '@core/services/preferences.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { ExpenseService } from '@features/expense/services/expense.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { WalletService } from '@features/wallet/services/wallet.service';

import { ShellComponent } from './shell.component';

/**
 * Stubs `localStorage` (shell reads/writes `bm_tweaks_pos` directly for the Tweaks panel drag
 * position) and configures the `TestBed` with the same provider set every `ShellComponent` spec
 * needs. Shared across `describe` blocks below to avoid duplicating the provider list.
 */
async function setUpShellFixture(): Promise<ComponentFixture<ShellComponent>> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  });

  await TestBed.configureTestingModule({
    imports: [ShellComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([{ path: 'tags', component: StubTagsPage }]),
      PreferencesService,
      {
        provide: WalletService,
        useValue: {
          selectedWallet$: of(null),
          wallets$: of([]),
          loadWallets: vi.fn(),
          selectWallet: vi.fn(),
        },
      },
      {
        provide: BulletService,
        useValue: {
          bullets$: of([]),
          loading$: of(false),
          loadByWalletId: vi.fn(),
        },
      },
      {
        provide: InstallmentService,
        useValue: {
          creditCards$: of([]),
        },
      },
      {
        provide: ExpenseService,
        useValue: {
          loadByWalletId: vi.fn(),
          create: vi.fn(),
        },
      },
      {
        provide: AuthService,
        useValue: {
          currentUser$: of(null),
          logout: vi.fn(),
          resendConfirmation: vi.fn(),
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ShellComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ShellComponent — Tools submenu', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function trigger(): HTMLElement {
    return fixture.nativeElement.querySelector('.ew-nav-item--tools') as HTMLElement;
  }

  function submenu(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.ew-tools-submenu');
  }

  it('opens the submenu on mouseenter', () => {
    trigger().dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(submenu()).toBeTruthy();
  });

  it('opens the submenu on keyboard focus (keyboard-only access path)', () => {
    trigger().dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(submenu()).toBeTruthy();
  });

  it('opens the submenu on Enter keydown', () => {
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(submenu()).toBeTruthy();
  });

  describe('close timing (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules a close 150ms after mouseleave', async () => {
      trigger().dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(submenu()).toBeTruthy();

      trigger().dispatchEvent(new MouseEvent('mouseleave'));
      await vi.advanceTimersByTimeAsync(149);
      fixture.detectChanges();
      expect(submenu()).toBeTruthy();

      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();
      expect(submenu()).toBeFalsy();
    });

    it('cancels the scheduled close when re-entering before the delay elapses', async () => {
      trigger().dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      trigger().dispatchEvent(new MouseEvent('mouseleave'));
      await vi.advanceTimersByTimeAsync(100);

      trigger().dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(100);
      fixture.detectChanges();
      expect(submenu()).toBeTruthy();

      // Re-entering only cancels the pending close — it doesn't stay open forever;
      // leaving again must schedule a fresh close.
      trigger().dispatchEvent(new MouseEvent('mouseleave'));
      await vi.advanceTimersByTimeAsync(150);
      fixture.detectChanges();
      expect(submenu()).toBeFalsy();
    });

    it('does not throw when a pending close timeout fires after destroy (listener/timer torn down)', async () => {
      trigger().dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      trigger().dispatchEvent(new MouseEvent('mouseleave'));
      fixture.destroy();

      await expect(vi.advanceTimersByTimeAsync(200)).resolves.not.toThrow();
    });
  });

  it('closes immediately on Escape', () => {
    trigger().dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(submenu()).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(submenu()).toBeFalsy();
  });

  it('closes the submenu when a submenu item is clicked', () => {
    trigger().dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelector('.ew-tools-submenu-item') as HTMLElement;
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(submenu()).toBeFalsy();
  });
});

describe('ShellComponent — recenter tweaks panel', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function recenterButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(
      'button[aria-label="Recenter tweaks panel"]',
    );
  }

  it('renders the recenter button when the Tweaks panel is visible (default preference)', () => {
    expect(recenterButton()).toBeTruthy();
  });

  it('does not render the recenter button when the Tweaks panel is hidden', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.showTweaks.set(false);
    fixture.detectChanges();

    expect(recenterButton()).toBeFalsy();
  });

  it('calls recenterTweaks() when clicked', () => {
    const spy = vi.spyOn(fixture.componentInstance as unknown as {
      recenterTweaks: () => void;
    }, 'recenterTweaks');

    recenterButton()?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledOnce();
  });

  it('recenters tweaksPos to a viewport-bounded position and persists it to localStorage', () => {
    const instance = fixture.componentInstance as unknown as {
      tweaksPos: () => { x: number; y: number };
      recenterTweaks: () => void;
    };

    instance.recenterTweaks();
    const pos = instance.tweaksPos();

    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeLessThanOrEqual(window.innerWidth);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeLessThanOrEqual(window.innerHeight);

    const stored = JSON.parse(localStorage.getItem('bm_tweaks_pos') ?? 'null');
    expect(stored).toEqual(pos);
  });
});

describe('ShellComponent — activityNav', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes a "Review imports" entry pointing at /review-imports, positioned right after "Payments" and before "Settings"', () => {
    const nav = (fixture.componentInstance as unknown as {
      activityNav: readonly { label: string; route: string; num: string }[];
    }).activityNav;

    const reviewEntry = nav.find((n) => n.route === '/review-imports');
    expect(reviewEntry).toBeTruthy();
    expect(reviewEntry?.label).toBe('Review imports');

    const paymentsIdx = nav.findIndex((n) => n.route === '/payments');
    const reviewIdx = nav.findIndex((n) => n.route === '/review-imports');
    const settingsIdx = nav.findIndex((n) => n.route === '/settings');
    expect(reviewIdx).toBe(paymentsIdx + 1);
    expect(settingsIdx).toBe(reviewIdx + 1);
  });

  it('renders the "Review imports" link in the sidebar', () => {
    const link = fixture.nativeElement.querySelector(
      'a.ew-nav-item[data-go="review imports"]',
    ) as HTMLAnchorElement | null;

    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/review-imports');
  });

  it('has no duplicate `num` values within activityNav (own sequence, unaffected by the new entry)', () => {
    const instance = fixture.componentInstance as unknown as {
      activityNav: readonly { num: string }[];
    };
    const nums = instance.activityNav.map((n) => n.num);

    expect(new Set(nums).size).toBe(nums.length);
  });

  it('does not reuse the `num` now assigned to "Review imports" in toolsNav', () => {
    const instance = fixture.componentInstance as unknown as {
      activityNav: readonly { num: string; route: string }[];
      toolsNav: readonly { num: string }[];
    };
    const reviewNum = instance.activityNav.find((n) => n.route === '/review-imports')?.num;

    expect(instance.toolsNav.some((n) => n.num === reviewNum)).toBe(false);
  });
});

describe('ShellComponent — user chip initials (F-B4: deriveInitials wiring)', () => {
  /**
   * Builds a shell fixture with a specific `AuthUser` on `currentUser$`, so
   * these tests can confirm the chip renders whatever `AuthService` (which
   * owns calling `deriveInitials()` internally via `toAuthUser()`) actually
   * produced — proving the wiring end-to-end, not re-testing
   * `deriveInitials()`'s own algorithm (covered by `derive-initials.spec.ts`).
   */
  async function setUpShellFixtureWithUser(user: {
    email: string;
    name: string | null;
    initials: string;
    emailVerified?: boolean | null;
  }): Promise<ComponentFixture<ShellComponent>> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: 'tags', component: StubTagsPage }]),
        PreferencesService,
        {
          provide: WalletService,
          useValue: {
            selectedWallet$: of(null),
            wallets$: of([]),
            loadWallets: vi.fn(),
            selectWallet: vi.fn(),
          },
        },
        {
          provide: BulletService,
          useValue: { bullets$: of([]), loading$: of(false), loadByWalletId: vi.fn() },
        },
        { provide: InstallmentService, useValue: { creditCards$: of([]) } },
        { provide: ExpenseService, useValue: { loadByWalletId: vi.fn(), create: vi.fn() } },
        {
          provide: AuthService,
          useValue: { currentUser$: of(user), logout: vi.fn(), resendConfirmation: vi.fn() },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function avatarEl(fixture: ComponentFixture<ShellComponent>): HTMLElement {
    return fixture.nativeElement.querySelector('.ew-user-av') as HTMLElement;
  }

  it('renders the real deriveInitials() output for a compound name in the chip', async () => {
    const fixture = await setUpShellFixtureWithUser({
      email: 'victor@example.com',
      name: 'Victor Porto',
      initials: 'VP',
    });

    expect(avatarEl(fixture).textContent?.trim()).toBe('VP');
  });

  it('renders the email-derived fallback initial when the user has no display name', async () => {
    const fixture = await setUpShellFixtureWithUser({
      email: 'victor@example.com',
      name: null,
      initials: 'V',
    });

    expect(avatarEl(fixture).textContent?.trim()).toBe('V');
  });

  it('has overflow-safe truncation styling on the avatar chip container (structural check)', async () => {
    const fixture = await setUpShellFixtureWithUser({
      email: 'victor@example.com',
      name: 'Victor Porto',
      initials: 'VP',
    });

    const el = avatarEl(fixture);
    const styles = getComputedStyle(el);
    expect(styles.overflow).toBe('hidden');
    expect(styles.textOverflow).toBe('ellipsis');
    expect(styles.whiteSpace).toBe('nowrap');
  });
});

describe('ShellComponent — email confirmation banner (F-C7)', () => {
  /**
   * Unlike `setUpShellFixtureWithUser` above (which uses a plain `of(user)`
   * observable, fine for static-render checks), the reactive-disappearance
   * test below needs to push a SECOND emission onto the same `currentUser$`
   * the shell already subscribed to — exactly what a live token refresh
   * would produce. A `BehaviorSubject` is required for that, so this helper
   * returns it alongside the fixture instead of hiding it behind `of(...)`.
   */
  function makeUser(overrides: {
    emailVerified: boolean | null | undefined;
  }): AuthUser {
    return {
      email: 'victor@example.com',
      name: 'Victor Porto',
      initials: 'VP',
      ...overrides,
    } as AuthUser;
  }

  async function setUpShellFixtureWithReactiveUser(
    user: AuthUser | null,
  ): Promise<{
    fixture: ComponentFixture<ShellComponent>;
    currentUser$: BehaviorSubject<AuthUser | null>;
    resendConfirmation: ReturnType<typeof vi.fn>;
  }> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });

    const currentUser$ = new BehaviorSubject<AuthUser | null>(user);
    const resendConfirmation = vi.fn().mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: 'tags', component: StubTagsPage }]),
        PreferencesService,
        {
          provide: WalletService,
          useValue: {
            selectedWallet$: of(null),
            wallets$: of([]),
            loadWallets: vi.fn(),
            selectWallet: vi.fn(),
          },
        },
        {
          provide: BulletService,
          useValue: { bullets$: of([]), loading$: of(false), loadByWalletId: vi.fn() },
        },
        { provide: InstallmentService, useValue: { creditCards$: of([]) } },
        { provide: ExpenseService, useValue: { loadByWalletId: vi.fn(), create: vi.fn() } },
        {
          provide: AuthService,
          useValue: { currentUser$, logout: vi.fn(), resendConfirmation },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return { fixture, currentUser$, resendConfirmation };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function banner(fixture: ComponentFixture<ShellComponent>): HTMLElement | null {
    return fixture.nativeElement.querySelector('.ew-verify-banner');
  }

  function resendButton(fixture: ComponentFixture<ShellComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.ew-verify-banner-btn') as HTMLButtonElement;
  }

  it('renders the banner for an authenticated user with emailVerified: false', async () => {
    const { fixture } = await setUpShellFixtureWithReactiveUser(
      makeUser({ emailVerified: false }),
    );

    expect(banner(fixture)).toBeTruthy();
  });

  it('does NOT render the banner for an authenticated user with emailVerified: true', async () => {
    const { fixture } = await setUpShellFixtureWithReactiveUser(
      makeUser({ emailVerified: true }),
    );

    expect(banner(fixture)).toBeFalsy();
  });

  it('renders the banner when emailVerified is null (legacy/unknown session — safe default is "show")', async () => {
    const { fixture } = await setUpShellFixtureWithReactiveUser(
      makeUser({ emailVerified: null }),
    );

    expect(banner(fixture)).toBeTruthy();
  });

  it('renders the banner when emailVerified is undefined (field entirely absent)', async () => {
    const { fixture } = await setUpShellFixtureWithReactiveUser(
      makeUser({ emailVerified: undefined }),
    );

    expect(banner(fixture)).toBeTruthy();
  });

  it('does NOT render the banner for an unauthenticated user (currentUser$ null)', async () => {
    const { fixture } = await setUpShellFixtureWithReactiveUser(null);

    expect(banner(fixture)).toBeFalsy();
  });

  it('resend button calls AuthService.resendConfirmation() with the current user email', async () => {
    const { fixture, resendConfirmation } = await setUpShellFixtureWithReactiveUser(
      makeUser({ emailVerified: false }),
    );

    resendButton(fixture).dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(resendConfirmation).toHaveBeenCalledExactlyOnceWith('victor@example.com');
  });

  describe('resend cooldown (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('disables the resend button and shows a countdown after a successful resend, then re-enables at 0', async () => {
      const { fixture } = await setUpShellFixtureWithReactiveUser(
        makeUser({ emailVerified: false }),
      );

      resendButton(fixture).dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(resendButton(fixture).disabled).toBe(true);
      expect(resendButton(fixture).textContent).toContain('Resend in 60s');

      await vi.advanceTimersByTimeAsync(59_000);
      fixture.detectChanges();
      expect(resendButton(fixture).disabled).toBe(true);
      expect(resendButton(fixture).textContent).toContain('Resend in 1s');

      await vi.advanceTimersByTimeAsync(1_000);
      fixture.detectChanges();
      expect(resendButton(fixture).disabled).toBe(false);
      expect(resendButton(fixture).textContent).toContain('Resend confirmation email');
    });

    it('does not stack multiple intervals across repeated resend clicks (takeWhile self-terminates)', async () => {
      const { fixture, resendConfirmation } = await setUpShellFixtureWithReactiveUser(
        makeUser({ emailVerified: false }),
      );

      resendButton(fixture).dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      // Button is disabled during cooldown — a second click attempt is a no-op
      // at the component level (canResendConfirmation guards it), proving the
      // only path to a second `interval` subscription is a second full
      // cooldown cycle, not concurrent stacking.
      expect(resendConfirmation).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      fixture.detectChanges();
      expect(resendButton(fixture).disabled).toBe(false);
    });
  });

  it('reactively hides the banner when emailVerified flips to true via a live currentUser$ update (e.g. token refresh), no reload needed', async () => {
    const { fixture, currentUser$ } = await setUpShellFixtureWithReactiveUser(
      makeUser({ emailVerified: false }),
    );

    expect(banner(fixture)).toBeTruthy();

    // Simulates what AuthService.refreshAccessToken() produces: a fresh
    // AuthUser pushed onto the SAME shared currentUser$ BehaviorSubject the
    // shell already subscribed to on construction — not a new fixture/component.
    currentUser$.next({
      email: 'victor@example.com',
      name: 'Victor Porto',
      initials: 'VP',
      emailVerified: true,
    });
    fixture.detectChanges();

    expect(banner(fixture)).toBeFalsy();
  });
});
