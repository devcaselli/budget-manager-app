import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { filter, interval, map, takeUntil } from 'rxjs';
import { takeWhile } from 'rxjs/operators';

import {
  ExpenseCreateDialogComponent,
  ExpenseCreateDialogData,
  ExpenseCreateDialogResult,
} from '@features/expense/components/expense-create-dialog/expense-create-dialog.component';
import { DESKTOP_DIALOG_MAX_WIDTH, DESKTOP_DIALOG_WIDTH } from '@shared/constants/dialog.constants';
import { ExpenseService } from '@features/expense/services/expense.service';
import { Wallet } from '@features/wallet/models/wallet';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { formatBrl } from '@shared/utils/currency';
import { AuthService } from '@core/auth/auth.service';
import { NavGroupLabel, PreferencesService } from '@core/services/preferences.service';
import { PendingReviewService } from '@features/pending-review/services/pending-review.service';
import { PendingReviewDialogComponent } from '@features/pending-review/components/pending-review-dialog/pending-review-dialog.component';
import { SyncService } from '@features/sync/services/sync.service';
import { ToastService } from '@shared/services/toast.service';

interface PopoverCoords {
  top: number;
  left: number;
}

interface TweaksPos {
  x: number;
  y: number;
}

/** Approximate rendered footprint (px) of the `.ew-tweaks` panel, used to keep it within viewport bounds. */
const TWEAKS_PANEL_WIDTH_PX = 230;
const TWEAKS_PANEL_HEIGHT_PX = 100;

/** Must match `.ew-wallet-pop`'s `width` in shell.component.scss (P2-1: design's 344px). */
const WALLET_POP_WIDTH_PX = 344;

/** Same cooldown length as F-C3's `CheckEmailPage`/F-C4's `ConfirmEmailPage` resend actions. */
const RESEND_COOLDOWN_SECONDS = 60;

interface NavEntry {
  readonly label: string;
  readonly route: string;
}

interface RenderedNavEntry extends NavEntry {
  readonly badgeCount: number;
}

interface NavGroup {
  readonly label: NavGroupLabel;
  readonly items: readonly RenderedNavEntry[];
  readonly open: boolean;
  readonly holdsActive: boolean;
  /**
   * Row index for the active rail (bound to `.ew-nav-rail`'s `--rail-index` custom
   * property; the `translateY(index * --nav-rail-step)` math lives in
   * `styles.scss`, not here — D10 review fix, was a concatenated `[style.transform]`
   * string), or `null` when no item in this group is active (rail hidden via opacity).
   */
  readonly railIndex: number | null;
  /**
   * P2-3 (post-epic-audit): shown in the group head only while `!open`, so collapsing a
   * group never fully hides that it holds pending work — the design's `"4"` / `"4 · 2 new"`
   * format. `null` when the group has no badge count to call out (plain `"4"`); a number
   * when at least one item's badge (currently only Inbox) is non-zero — before this fix,
   * collapsing MANAGER hid the Inbox badge entirely with no visible trace.
   */
  readonly closedCountLabel: string;
}

/** Static group→item route map (D4 regroup: BUDGET / LEDGER / MANAGER / EXTERNAL). */
const NAV_GROUP_DEFS: readonly { label: NavGroupLabel; items: readonly NavEntry[] }[] = [
  {
    label: 'BUDGET',
    items: [
      { label: 'Wallets', route: '/wallets' },
      { label: 'Bullets', route: '/bullets' },
      { label: 'Extra budgets', route: '/extra-budgets' },
      { label: 'Reserved budgets', route: '/reserved-budgets' },
    ],
  },
  {
    label: 'LEDGER',
    items: [
      { label: 'Expenses', route: '/expenses' },
      { label: 'Subscriptions', route: '/subscriptions' },
      { label: 'Installments', route: '/installments' },
    ],
  },
  {
    label: 'MANAGER',
    items: [
      { label: 'Credit cards', route: '/credit-cards' },
      { label: 'Payments', route: '/payments' },
      { label: 'Inbox', route: '/review-imports' },
      { label: 'Tags', route: '/tags' },
    ],
  },
  {
    label: 'EXTERNAL',
    items: [
      { label: 'Payers', route: '/payers' },
      { label: 'Shares', route: '/shares' },
    ],
  },
];

/** Standalone Settings entry — footer icon button next to the theme toggle (design), not part of any group. */
const SETTINGS_NAV: NavEntry = { label: 'Settings', route: '/settings' };

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, RouterLink, RouterOutlet],
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
  private readonly pendingReviewService = inject(PendingReviewService);
  private readonly syncService = inject(SyncService);
  private readonly toast = inject(ToastService);
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

  /** Post-epic-audit P1-3: moved here from ExpensePage — the design puts the Sync
   *  trigger in the topbar (global, next to the wallet ticker), not inside the
   *  Expenses page panel head. */
  protected readonly isSyncing = toSignal(this.syncService.syncing$, { initialValue: false });

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

  protected readonly dashboardNav: NavEntry = { label: 'Dashboard', route: '/dashboard' };
  protected readonly settingsNav: NavEntry = SETTINGS_NAV;
  protected readonly settingsActive = computed(() => this.currentRouteLabel() === SETTINGS_NAV.label);

  /** Count of items in `PENDING_REVIEW` state, badged on the Inbox nav item — reuses the same
   *  `pendingReviews$` list the dedicated `/review-imports` page and its modal already read from
   *  (D4 acceptance criteria: "reuse how pending-review currently exposes its count"). */
  protected readonly pendingReviewCount = toSignal(
    this.pendingReviewService.pendingReviews$.pipe(map((items) => items.length)),
    { initialValue: 0 },
  );

  /** Dashboard is a standalone top item (outside the 4 groups) — its own single-row rail. */
  protected readonly dashboardActive = computed(() => this.currentRouteLabel() === this.dashboardNav.label);

  /** Regrouped sidebar nav (D4): BUDGET / LEDGER / MANAGER / EXTERNAL, each independently
   *  collapsible via `PreferencesService.closedNavGroups`. A group holding the active route is
   *  always rendered open and cannot be collapsed (mirrors the design's `canToggle: !holdsActive`)
   *  so navigating into a group never hides the very item you're on. */
  protected readonly navGroups = computed<readonly NavGroup[]>(() => {
    const activeLabel = this.currentRouteLabel();
    const closed = this.prefs.closedNavGroups();
    const pendingCount = this.pendingReviewCount();

    return NAV_GROUP_DEFS.map((group) => {
      const items: RenderedNavEntry[] = group.items.map((item) => ({
        ...item,
        badgeCount: item.route === '/review-imports' ? pendingCount : 0,
      }));
      const activeIndex = items.findIndex((item) => item.label === activeLabel);
      const holdsActive = activeIndex >= 0;
      const open = holdsActive || !closed[group.label];
      const newCount = items.reduce((sum, item) => sum + item.badgeCount, 0);
      const closedCountLabel = newCount > 0 ? `${items.length} · ${newCount} new` : `${items.length}`;

      return {
        label: group.label,
        items,
        open,
        holdsActive,
        railIndex: activeIndex >= 0 ? activeIndex : null,
        closedCountLabel,
      };
    });
  });

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
  }

  /**
   * P2-1 (post-epic-audit) / Major 4 (post-consolidated-review, revised after
   * verification review restored the sidebar trigger): coords are anchored
   * relative to the topbar (design: `top:48px; right:0` off the topbar's ticker).
   * The popover always anchors to the topbar per design, regardless of which of
   * the 3 wallet triggers (sidebar, topbar desktop, topbar mobile) opened it —
   * so this reads the topbar's own rect directly instead of resolving it from
   * `event.currentTarget`, which would give the wrong anchor when the sidebar
   * button is the one clicked. `right` is computed from the viewport edge so the
   * popover's fixed 344px width (see shell.component.scss `.ew-wallet-pop`) lines
   * up with the topbar's own right edge, matching the design's `right:0` intent.
   */
  protected toggleWalletPop(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.walletPopOpen()) {
      const topbar = (event.currentTarget as HTMLElement).closest('.ew-app')?.querySelector('.ew-topbar-inner');
      const rect = (topbar as HTMLElement | null)?.getBoundingClientRect() ?? (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.walletPopCoords.set({
        top: rect.bottom + 12,
        left: rect.right - WALLET_POP_WIDTH_PX,
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

  /** Toggles one sidebar nav group open/closed — no-op for the group holding the active route
   *  (the design's `canToggle: !holdsActive`; the template also disables the button so this
   *  guard is defense-in-depth, not the only enforcement). */
  protected toggleNavGroup(group: NavGroup): void {
    if (group.holdsActive) return;
    this.prefs.toggleNavGroup(group.label);
  }

  protected toggleSidebar(): void {
    this.prefs.toggleSidebarHidden();
  }

  protected switchWallet(wallet: Wallet): void {
    if (this.selectedWallet()?.id === wallet.id) {
      return;
    }

    this.walletService.selectWallet(wallet);
    this.walletPopOpen.set(false);
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

  /** Moved from ExpensePage (post-epic-audit P1-3). Ingests bank-SMS expenses, applies the
   *  result to PendingReviewService (feeds the shell's own Inbox badge and the dedicated
   *  /review-imports page), then opens the review dialog for confirmation. */
  protected syncNow(): void {
    if (this.isSyncing()) return;

    this.syncService
      .ingest()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.pendingReviewService.applySyncResult(result);
          this.toast.show('Expenses imported');
          this.openPendingReviewDialog();
        },
        error: () => undefined,
      });
  }

  private openPendingReviewDialog(): void {
    this.dialog
      .open(PendingReviewDialogComponent, {
        width: '60rem',
        maxWidth: 'calc(100vw - 2rem)',
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Unconditional reload: Expense creation happens on confirm *inside* the modal,
        // not at sync time, so a zero `created` count at sync time doesn't mean nothing
        // needs reloading — items may have been confirmed during the dialog session.
        const walletId = this.selectedWallet()?.id ?? null;
        this.expenseService.loadByWalletId(walletId);
      });
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
      width: DESKTOP_DIALOG_WIDTH,
      maxWidth: DESKTOP_DIALOG_MAX_WIDTH,
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
        next: () => {
          this.expenseService.loadByWalletId(walletId);
          this.toast.show('Expense created');
        },
        error: () => undefined,
      });
  }

  private syncRouteLabel(): void {
    const url = this.router.url.split('?')[0].split('#')[0];
    const all: readonly NavEntry[] = [
      this.dashboardNav,
      ...NAV_GROUP_DEFS.flatMap((group) => group.items),
      SETTINGS_NAV,
    ];
    const match = all.find((n) => url.startsWith(n.route));
    this.currentRouteLabel.set(match?.label ?? 'Dashboard');
  }
}
