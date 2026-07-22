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

describe('ShellComponent — Tools submenu', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    // shell.component.ts reads/writes 'bm_tweaks_pos' via localStorage directly (Tweaks panel
    // drag position) — stub it so component construction doesn't depend on jsdom's storage setup.
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

    fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
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
