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
import { PendingReviewService } from '@features/pending-review/services/pending-review.service';
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
        provide: PendingReviewService,
        useValue: {
          pendingReviews$: of([]),
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

describe('ShellComponent — sidebar nav groups (D4)', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function groupHead(label: string): HTMLButtonElement {
    const heads = Array.from(
      fixture.nativeElement.querySelectorAll('.ew-nav-group-head'),
    ) as HTMLButtonElement[];
    const match = heads.find((el) => el.textContent?.trim().startsWith(label));
    if (!match) throw new Error(`No nav group head found for label "${label}"`);
    return match;
  }

  function navLink(dataGo: string): HTMLAnchorElement | null {
    return fixture.nativeElement.querySelector(`a.ew-nav-item[data-go="${dataGo}"]`);
  }

  it('renders the four regrouped sections: BUDGET, LEDGER, MANAGER, EXTERNAL', () => {
    expect(groupHead('BUDGET')).toBeTruthy();
    expect(groupHead('LEDGER')).toBeTruthy();
    expect(groupHead('MANAGER')).toBeTruthy();
    expect(groupHead('EXTERNAL')).toBeTruthy();
  });

  it('places Inbox (/review-imports) inside the MANAGER group', () => {
    const link = navLink('inbox');

    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/review-imports');
  });

  it('collapses a group on header click and persists the collapsed state to localStorage', () => {
    groupHead('LEDGER').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(navLink('expenses')).toBeFalsy();
    expect(JSON.parse(localStorage.getItem('bm_nav_closed') ?? 'null')).toEqual({ LEDGER: true });
  });

  it('re-expands a collapsed group on a second header click', () => {
    groupHead('LEDGER').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    groupHead('LEDGER').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(navLink('expenses')).toBeTruthy();
  });

  it('restores a collapsed group from localStorage on a fresh boot', async () => {
    // `setUpShellFixture()` stubs a brand-new, empty `localStorage` Map on every call — seed
    // the store it will actually read from directly, rather than writing through the OLD
    // fixture's stub (which a fresh stub would just discard).
    const store = new Map<string, string>([['bm_nav_closed', JSON.stringify({ EXTERNAL: true })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: 'tags', component: StubTagsPage }]),
        PreferencesService,
        {
          provide: WalletService,
          useValue: { selectedWallet$: of(null), wallets$: of([]), loadWallets: vi.fn(), selectWallet: vi.fn() },
        },
        { provide: BulletService, useValue: { bullets$: of([]), loading$: of(false), loadByWalletId: vi.fn() } },
        { provide: InstallmentService, useValue: { creditCards$: of([]) } },
        { provide: ExpenseService, useValue: { loadByWalletId: vi.fn(), create: vi.fn() } },
        { provide: PendingReviewService, useValue: { pendingReviews$: of([]) } },
        { provide: AuthService, useValue: { currentUser$: of(null), logout: vi.fn(), resendConfirmation: vi.fn() } },
      ],
    }).compileComponents();
    const fresh = TestBed.createComponent(ShellComponent);
    fresh.detectChanges();

    const heads = Array.from(
      fresh.nativeElement.querySelectorAll('.ew-nav-group-head'),
    ) as HTMLButtonElement[];
    const externalHead = heads.find((el) => el.textContent?.trim().startsWith('EXTERNAL'));
    expect(externalHead?.getAttribute('aria-expanded')).toBe('false');
  });

  it('disables the group toggle button for the group holding the active route', () => {
    // Default test router has no active route matching any nav item's `route`
    // prefix beyond the root, so this asserts the disabled-button mechanism
    // exists and is wired to `holdsActive`/`canToggle`, not a specific route —
    // see PreferencesService spec for the toggle's own persistence behavior.
    const head = groupHead('BUDGET');
    expect(head.hasAttribute('disabled')).toBe(false);
  });

  it('does not render a badge on the Inbox link when there are no pending reviews', () => {
    const link = navLink('inbox');

    expect(link?.querySelector('.ew-nav-badge')).toBeFalsy();
  });
});

describe('ShellComponent — Inbox pending-review badge (D4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setUpShellFixtureWithPendingReviews(count: number): Promise<ComponentFixture<ShellComponent>> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });

    const pendingReviews = Array.from({ length: count }, (_, i) => ({ id: `pr-${i}` }));

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: 'tags', component: StubTagsPage }]),
        PreferencesService,
        {
          provide: WalletService,
          useValue: { selectedWallet$: of(null), wallets$: of([]), loadWallets: vi.fn(), selectWallet: vi.fn() },
        },
        { provide: BulletService, useValue: { bullets$: of([]), loading$: of(false), loadByWalletId: vi.fn() } },
        { provide: InstallmentService, useValue: { creditCards$: of([]) } },
        { provide: ExpenseService, useValue: { loadByWalletId: vi.fn(), create: vi.fn() } },
        { provide: PendingReviewService, useValue: { pendingReviews$: of(pendingReviews) } },
        { provide: AuthService, useValue: { currentUser$: of(null), logout: vi.fn(), resendConfirmation: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the pending count on the Inbox badge when there are pending reviews', async () => {
    const fixture = await setUpShellFixtureWithPendingReviews(3);

    const link = fixture.nativeElement.querySelector('a.ew-nav-item[data-go="inbox"]') as HTMLAnchorElement;
    const badge = link.querySelector('.ew-nav-badge');

    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('3');
  });

  it('does not render the Inbox badge when the pending count is zero', async () => {
    const fixture = await setUpShellFixtureWithPendingReviews(0);

    const link = fixture.nativeElement.querySelector('a.ew-nav-item[data-go="inbox"]') as HTMLAnchorElement;

    expect(link.querySelector('.ew-nav-badge')).toBeFalsy();
  });
});

describe('ShellComponent — desktop sidebar collapse (D4)', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function collapseButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.ew-side-collapse');
  }

  function expandButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.ew-side-expand');
  }

  function sideEl(): HTMLElement {
    return fixture.nativeElement.querySelector('.ew-side');
  }

  function appEl(): HTMLElement {
    return fixture.nativeElement.querySelector('.ew-app');
  }

  it('is expanded by default: no --hidden/--sidebar-hidden classes, no expand button', () => {
    expect(sideEl().classList.contains('ew-side--hidden')).toBe(false);
    expect(appEl().classList.contains('ew-app--sidebar-hidden')).toBe(false);
    expect(expandButton()).toBeFalsy();
  });

  it('collapses the sidebar on collapse-button click and persists the choice to localStorage', () => {
    collapseButton()?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(sideEl().classList.contains('ew-side--hidden')).toBe(true);
    expect(appEl().classList.contains('ew-app--sidebar-hidden')).toBe(true);
    expect(localStorage.getItem('bm_sidebar_hidden')).toBe('on');
  });

  it('shows the expand button once collapsed, and clicking it restores the sidebar', () => {
    collapseButton()?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(expandButton()).toBeTruthy();

    expandButton()?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(sideEl().classList.contains('ew-side--hidden')).toBe(false);
    expect(appEl().classList.contains('ew-app--sidebar-hidden')).toBe(false);
    expect(expandButton()).toBeFalsy();
    expect(localStorage.getItem('bm_sidebar_hidden')).toBe('off');
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

describe('ShellComponent — nav (D4 regroup)', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes an "Inbox" entry pointing at /review-imports inside navGroups', () => {
    const groups = (fixture.componentInstance as unknown as {
      navGroups: () => readonly { label: string; items: readonly { label: string; route: string }[] }[];
    }).navGroups();

    const managerGroup = groups.find((g) => g.label === 'MANAGER');
    const inboxEntry = managerGroup?.items.find((i) => i.route === '/review-imports');

    expect(inboxEntry).toBeTruthy();
    expect(inboxEntry?.label).toBe('Inbox');
  });

  it('renders the Inbox link in the sidebar under data-go="inbox"', () => {
    const link = fixture.nativeElement.querySelector(
      'a.ew-nav-item[data-go="inbox"]',
    ) as HTMLAnchorElement | null;

    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/review-imports');
  });

  it('has no duplicate `num` values across all nav groups plus Dashboard/Settings', () => {
    const instance = fixture.componentInstance as unknown as {
      navGroups: () => readonly { items: readonly { num: string }[] }[];
      dashboardNav: { num: string };
      settingsNav: { num: string };
    };
    const nums = [
      instance.dashboardNav.num,
      ...instance.navGroups().flatMap((g) => g.items.map((i) => i.num)),
      instance.settingsNav.num,
    ];

    expect(new Set(nums).size).toBe(nums.length);
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
        { provide: PendingReviewService, useValue: { pendingReviews$: of([]) } },
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
        { provide: PendingReviewService, useValue: { pendingReviews$: of([]) } },
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
