import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { filter, interval, map, takeUntil } from 'rxjs';
import { takeWhile } from 'rxjs/operators';

import {
  ExpenseCreateDialogComponent,
  ExpenseCreateDialogData,
  ExpenseCreateDialogResult,
} from '@features/expense/components/expense-create-dialog/expense-create-dialog.component';
import { ExpenseService } from '@features/expense/services/expense.service';
import { Wallet } from '@features/wallet/models/wallet';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { DecimalPipe } from '@angular/common';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { formatBrl } from '@shared/utils/currency';
import { AuthService } from '@core/auth/auth.service';
import { PreferencesService } from '@core/services/preferences.service';

interface PopoverCoords {
  top: number;
  left: number;
}

interface TweaksPos {
  x: number;
  y: number;
}

/** Horizontal gap (px) between the Tools nav trigger and its flyout submenu. */
const TOOLS_SUBMENU_GAP_PX = 8;

/** Approximate rendered footprint (px) of the `.ew-tweaks` panel, used to keep it within viewport bounds. */
const TWEAKS_PANEL_WIDTH_PX = 230;
const TWEAKS_PANEL_HEIGHT_PX = 100;

/** Same cooldown length as F-C3's `CheckEmailPage`/F-C4's `ConfirmEmailPage` resend actions. */
const RESEND_COOLDOWN_SECONDS = 60;

interface NavEntry {
  readonly label: string;
  readonly route: string;
  readonly num: string;
  readonly exact?: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, BrlCurrencyPipe, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly expenseService = inject(ExpenseService);
  private readonly walletService = inject(WalletService);
  private readonly bulletService = inject(BulletService);
  private readonly installmentService = inject(InstallmentService);
  private readonly authService = inject(AuthService);
  protected readonly prefs = inject(PreferencesService);

  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  protected readonly wallets = toSignal(this.walletService.wallets$, { initialValue: [] });

  protected readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  protected readonly bulletsLoading = toSignal(this.bulletService.loading$, { initialValue: false });
  private readonly creditCards = toSignal(this.installmentService.creditCards$, { initialValue: [] });

  protected readonly walletPopOpen = signal(false);
  protected readonly walletPopCoords = signal<PopoverCoords>({ top: 0, left: 0 });
  protected readonly userMenuOpen = signal(false);

  protected readonly tweaksPos = signal<TweaksPos>(
    (JSON.parse(localStorage.getItem('bm_tweaks_pos') ?? 'null') as TweaksPos | null)
    ?? { x: window.innerWidth - 258, y: window.innerHeight - 200 },
  );
  protected readonly tweaksDragging = signal(false);
  protected readonly userName = toSignal(
    this.authService.currentUser$.pipe(map((u) => u?.name ?? '')),
    { initialValue: '' },
  );
  protected readonly userEmail = toSignal(
    this.authService.currentUser$.pipe(map((u) => u?.email ?? '')),
    { initialValue: '' },
  );
  protected readonly userInitials = toSignal(
    this.authService.currentUser$.pipe(map((u) => u?.initials ?? '?')),
    { initialValue: '?' },
  );
  /**
   * Sourced from `AuthUser.emailVerified` (F-C7). Reactive over
   * `currentUser$` (the same shared `BehaviorSubject` `userName`/`userEmail`/
   * `userInitials` already read from) so the banner disappears immediately
   * once a fresh login or token refresh reports `emailVerified: true` — no
   * page reload needed, mirroring how F-B3's profile-name update already
   * propagates through this exact subject.
   *
   * `null`/`undefined` (an unauthenticated `currentUser$` emission, or a
   * legacy session predating this field) collapses to `false` here — i.e.
   * treated the SAME as an explicit "not verified yet". This is the opposite
   * safe-default direction from `userName`'s `?? ''` above: an unknown name
   * degrades harmlessly to an empty chip, but an unknown verification state
   * must never silently suppress a legitimate soft-verification prompt. See
   * `AuthUser.emailVerified`'s doc in `auth.model.ts` for the full reasoning.
   */
  private readonly emailVerified = toSignal(
    this.authService.currentUser$.pipe(map((u) => u?.emailVerified ?? false)),
    { initialValue: false },
  );
  /**
   * True only for an authenticated user whose `emailVerified` is `false` (or
   * unknown, folded into `false` above). The shell itself is an
   * authenticated-only route (guarded by `authGuard`), so `currentUser$`
   * being non-null is implicit whenever this component is alive — still
   * checked explicitly via `userEmail()` so the banner never renders during
   * the brief window before the first `currentUser$` emission resolves.
   *
   * Purely informational per the epic's confirmed soft-verification design
   * ("sem bloquear, só exibir") — this signal drives ONLY the banner's
   * visibility. It must never be read by any guard/redirect logic.
   */
  protected readonly showEmailVerificationBanner = computed(
    () => this.userEmail().length > 0 && !this.emailVerified(),
  );
  protected readonly resendCooldownSeconds = signal(0);
  protected readonly resendPending = signal(false);
  /** Same always-generic message contract as F-C3/F-C4's resend actions. */
  protected readonly resendMessage = signal('');

  protected readonly currentRouteLabel = signal('Dashboard');

  protected readonly workspaceNav: readonly NavEntry[] = [
    { label: 'Dashboard', route: '/dashboard', num: '01', exact: true },
    { label: 'Wallets',   route: '/wallets',   num: '02' },
    { label: 'Bullets',   route: '/bullets',   num: '03' },
    { label: 'Extra budgets', route: '/extra-budgets', num: '04' },
    { label: 'Reserved budgets', route: '/reserved-budgets', num: '05' },
  ];

  protected readonly activityNav: readonly NavEntry[] = [
    { label: 'Expenses',      route: '/expenses',      num: '05' },
    { label: 'Installments',  route: '/installments',  num: '06' },
    { label: 'Payers',        route: '/payers',        num: '07' },
    { label: 'Shares',        route: '/shares',        num: '08' },
    { label: 'Credit cards',  route: '/credit-cards',  num: '09' },
    { label: 'Subscriptions', route: '/subscriptions', num: '10' },
    { label: 'Payments',      route: '/payments',      num: '11' },
    { label: 'Review imports', route: '/review-imports', num: '12' },
    { label: 'Settings',      route: '/settings',      num: '13' },
  ];

  protected readonly toolsNav: readonly NavEntry[] = [
    { label: 'Tags', route: '/tags', num: '14' },
  ];

  protected readonly toolsMenuOpen = signal(false);
  protected readonly toolsMenuCoords = signal<PopoverCoords>({ top: 0, left: 0 });
  private toolsMenuCloseTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Percentage of wallet budget already committed. */
  protected readonly utilizationRate = computed(() => {
    const wallet = this.selectedWallet();
    if (!wallet || wallet.budget <= 0) return 0;
    const committed = wallet.budget - wallet.remaining;
    return Math.round((committed / wallet.budget) * 100);
  });
  protected readonly walletQuickChoices = computed(() => {
    const selectedId = this.selectedWallet()?.id ?? null;
    return this.wallets()
      .filter((wallet) => wallet.id !== selectedId)
      .slice(0, 4);
  });

  constructor() {
    // Theme/privacy boot logic lives in PreferencesService (applied as soon
    // as it's constructed — injecting `prefs` above already triggered it).

    this.walletService.loadWallets();

    // Auto-load bullets whenever selected wallet changes
    this.walletService.selectedWallet$
      .pipe(
        filter((wallet) => wallet !== null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((wallet) => this.bulletService.loadByWalletId(wallet.id));

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncRouteLabel());

    this.syncRouteLabel();

    // Close wallet popover on click-outside or Escape
    const closeOnClick = () => this.walletPopOpen.set(false);
    const closeOnEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') this.walletPopOpen.set(false); };
    document.addEventListener('click', closeOnClick);
    document.addEventListener('keydown', closeOnEsc);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('click', closeOnClick);
      document.removeEventListener('keydown', closeOnEsc);
    });

    // Close tools submenu on Escape (reuses the same keydown listener pattern)
    const closeToolsOnEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeToolsMenu();
    };
    document.addEventListener('keydown', closeToolsOnEsc);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('keydown', closeToolsOnEsc);
      this.clearToolsMenuCloseTimeout();
    });
  }

  protected toggleWalletPop(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.walletPopOpen()) {
      const btn = event.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      this.walletPopCoords.set({
        top: rect.bottom - 8,
        left: rect.right + 14,
      });
      // Ensure bullets are loaded when popover opens
      const walletId = this.selectedWallet()?.id ?? null;
      if (walletId && this.bullets().length === 0) {
        this.bulletService.loadByWalletId(walletId);
      }
    }
    this.walletPopOpen.update((v) => !v);
  }

  protected closeWalletPop(): void {
    this.walletPopOpen.set(false);
  }

  protected onToolsMenuEnter(event: Event): void {
    this.clearToolsMenuCloseTimeout();
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    this.toolsMenuCoords.set({ top: rect.top, left: rect.right + TOOLS_SUBMENU_GAP_PX });
    this.toolsMenuOpen.set(true);
  }

  protected cancelToolsMenuClose(): void {
    this.clearToolsMenuCloseTimeout();
  }

  protected onToolsMenuLeave(): void {
    this.clearToolsMenuCloseTimeout();
    this.toolsMenuCloseTimeout = setTimeout(() => this.toolsMenuOpen.set(false), 150);
  }

  protected closeToolsMenu(): void {
    this.clearToolsMenuCloseTimeout();
    this.toolsMenuOpen.set(false);
  }

  private clearToolsMenuCloseTimeout(): void {
    if (this.toolsMenuCloseTimeout !== null) {
      clearTimeout(this.toolsMenuCloseTimeout);
      this.toolsMenuCloseTimeout = null;
    }
  }

  protected switchWallet(wallet: Wallet): void {
    if (this.selectedWallet()?.id === wallet.id) {
      return;
    }

    this.walletService.selectWallet(wallet);
    this.walletPopOpen.set(false);
  }

  protected toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  /** Whether the resend button is currently clickable — mirrors `CheckEmailPage.canResend`. */
  protected get canResendConfirmation(): boolean {
    return (
      this.userEmail().length > 0 &&
      this.resendCooldownSeconds() === 0 &&
      !this.resendPending()
    );
  }

  /**
   * Reuses `AuthService.resendConfirmation()` (F-C1) — the 3rd consumer
   * after `CheckEmailPage` (F-C3) and `ConfirmEmailPage` (F-C4). Same
   * always-200 anti-enumeration contract: success and failure settle
   * identically, in both copy and cooldown timing.
   */
  protected onResendConfirmation(): void {
    const email = this.userEmail();
    if (!this.canResendConfirmation || !email) {
      return;
    }

    this.resendPending.set(true);
    this.resendMessage.set('');

    this.authService
      .resendConfirmation(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onResendConfirmationSettled(),
        error: () => this.onResendConfirmationSettled(),
      });
  }

  private onResendConfirmationSettled(): void {
    this.resendPending.set(false);
    this.resendMessage.set("If your account needs verification, we've sent a new email.");
    this.startResendCooldown();
  }

  /**
   * One tick per second, counting down to 0. Mirrors `CheckEmailPage`'s
   * `startCooldown()` exactly (`signal` + `interval` + `takeUntilDestroyed` +
   * `takeWhile`, self-terminating) — see that component's doc for why
   * `takeWhile` matters (without it, repeated resend clicks would stack
   * multiple never-ending `interval` subscriptions).
   */
  private startResendCooldown(): void {
    this.resendCooldownSeconds.set(RESEND_COOLDOWN_SECONDS);

    interval(1000)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeWhile(() => this.resendCooldownSeconds() > 0),
      )
      .subscribe(() => {
        this.resendCooldownSeconds.set(Math.max(this.resendCooldownSeconds() - 1, 0));
      });
  }

  protected logout(event: MouseEvent): void {
    event.stopPropagation();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  protected togglePrivacy(): void { this.prefs.togglePrivacy(); }
  protected toggleTheme(): void { this.prefs.toggleDarkTheme(); }
  protected toggleLayout(): void { this.prefs.toggleCenteredLayout(); }

  protected refresh(): void {
    const walletId = this.selectedWallet()?.id ?? null;
    this.walletService.loadWallets();
    this.bulletService.loadByWalletId(walletId);
    this.expenseService.loadByWalletId(walletId);
  }

  protected openTransactionDialog(): void {
    const wallet = this.selectedWallet();
    if (!wallet) return;

    const rawBullets = this.bullets();
    const bullets = rawBullets
      .filter((b) => Number(b.remaining) > 0)
      .map((b) => ({
        id: b.id,
        description: b.description,
        remaining: formatBrl(Number(b.remaining)),
      }));

    const creditCards = this.creditCards().map((c) => ({ id: c.id, name: c.name }));

    const data: ExpenseCreateDialogData = {
      walletDescription: wallet.description || 'Wallet',
      bullets,
      creditCards,
    };

    const dialogRef = this.dialog.open<
      ExpenseCreateDialogComponent,
      ExpenseCreateDialogData,
      ExpenseCreateDialogResult
    >(ExpenseCreateDialogComponent, {
      width: '30rem',
      maxWidth: 'calc(100vw - 2rem)',
      data,
    });

    dialogRef.componentInstance.submitted
      .pipe(takeUntil(dialogRef.afterClosed()), takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.createExpense(wallet.id, result));

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.createExpense(wallet.id, result);
      });
  }

  protected startDrag(event: MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX - this.tweaksPos().x;
    const startY = event.clientY - this.tweaksPos().y;
    this.tweaksDragging.set(true);

    const onMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - TWEAKS_PANEL_WIDTH_PX, e.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - TWEAKS_PANEL_HEIGHT_PX, e.clientY - startY));
      this.tweaksPos.set({ x, y });
    };

    const onUp = () => {
      this.tweaksDragging.set(false);
      localStorage.setItem('bm_tweaks_pos', JSON.stringify(this.tweaksPos()));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /** Resets the Tweaks panel to a viewport-centered position, e.g. when it drifted off-screen after a resize. */
  protected recenterTweaks(): void {
    const centeredPos: TweaksPos = {
      x: Math.max(0, (window.innerWidth - TWEAKS_PANEL_WIDTH_PX) / 2),
      y: Math.max(0, (window.innerHeight - TWEAKS_PANEL_HEIGHT_PX) / 2),
    };
    this.tweaksPos.set(centeredPos);
    localStorage.setItem('bm_tweaks_pos', JSON.stringify(centeredPos));
  }

  private createExpense(walletId: string, expense: ExpenseCreateDialogResult): void {
    this.expenseService
      .create({
        name: expense.name,
        cost: expense.cost,
        purchaseDate: expense.purchaseDate,
        walletId,
        creditCardId: expense.creditCardId,
        ...(expense.bulletId ? { bulletId: expense.bulletId } : {}),
        ...(expense.installment && expense.installmentNumber
          ? { installment: true, installmentNumber: expense.installmentNumber }
          : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.expenseService.loadByWalletId(walletId),
        error: () => undefined,
      });
  }

  private syncRouteLabel(): void {
    const url = this.router.url.split('?')[0].split('#')[0];
    const all = [...this.workspaceNav, ...this.activityNav, ...this.toolsNav];
    const match = all.find((n) => url.startsWith(n.route));
    this.currentRouteLabel.set(match?.label ?? 'Dashboard');
  }
}
