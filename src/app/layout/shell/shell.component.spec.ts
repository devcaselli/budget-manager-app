import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

/** Stand-in for the real /tags page (Task 2, not yet implemented) — keeps router.navigate resolvable in tests. */
@Component({ template: '' })
class StubTagsPage {}

import { AuthService } from '@core/auth/auth.service';
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

describe('ShellComponent — activityNav', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    fixture = await setUpShellFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes a "Review imports" entry pointing at /review-imports, positioned right after "Connected accounts" and before "Settings"', () => {
    const nav = (fixture.componentInstance as unknown as {
      activityNav: readonly { label: string; route: string; num: string }[];
    }).activityNav;

    const reviewEntry = nav.find((n) => n.route === '/review-imports');
    expect(reviewEntry).toBeTruthy();
    expect(reviewEntry?.label).toBe('Review imports');

    const connectedIdx = nav.findIndex((n) => n.route === '/connected-accounts');
    const reviewIdx = nav.findIndex((n) => n.route === '/review-imports');
    const settingsIdx = nav.findIndex((n) => n.route === '/settings');
    expect(reviewIdx).toBe(connectedIdx + 1);
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
        { provide: AuthService, useValue: { currentUser$: of(user), logout: vi.fn() } },
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
