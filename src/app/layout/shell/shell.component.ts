import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
} from '@angular/core';

interface PopoverCoords { top: number; left: number; }
interface TweaksPos { x: number; y: number; }
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { filter, map, takeUntil } from 'rxjs';

import {
  ExpenseCreateDialogComponent,
  ExpenseCreateDialogData,
  ExpenseCreateDialogResult,
} from '@features/expense/components/expense-create-dialog/expense-create-dialog.component';
import { ExpenseService } from '@features/expense/services/expense.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { DecimalPipe } from '@angular/common';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { AuthService } from '@core/auth/auth.service';
import { PreferencesService } from '@core/services/preferences.service';

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


  protected readonly currentRouteLabel = signal('Dashboard');

  protected readonly workspaceNav: readonly NavEntry[] = [
    { label: 'Dashboard', route: '/dashboard', num: '01', exact: true },
    { label: 'Wallets',   route: '/wallets',   num: '02' },
    { label: 'Bullets',   route: '/bullets',   num: '03' },
  ];

  protected readonly activityNav: readonly NavEntry[] = [
    { label: 'Expenses',      route: '/expenses',      num: '04' },
    { label: 'Installments',  route: '/installments',  num: '05' },
    { label: 'Payers',        route: '/payers',        num: '06' },
    { label: 'Credit cards',  route: '/credit-cards',  num: '07' },
    { label: 'Subscriptions', route: '/subscriptions', num: '08' },
    { label: 'Payments',      route: '/payments',      num: '09' },
    { label: 'Settings',      route: '/settings',      num: '10' },
  ];

  /** Percentage of wallet budget already committed. */
  protected readonly utilizationRate = computed(() => {
    const wallet = this.selectedWallet();
    if (!wallet || wallet.budget <= 0) return 0;
    const committed = wallet.budget - wallet.remaining;
    return Math.round((committed / wallet.budget) * 100);
  });

  constructor() {
    // Apply persisted theme on boot
    if (!this.prefs.darkTheme()) {
      document.body.classList.add('ew-light');
    }

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

  protected toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
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
        remaining: new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(Number(b.remaining)),
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
      const x = Math.max(0, Math.min(window.innerWidth - 230, e.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - startY));
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
    const all = [...this.workspaceNav, ...this.activityNav];
    const match = all.find((n) => url.startsWith(n.route));
    this.currentRouteLabel.set(match?.label ?? 'Dashboard');
  }
}
