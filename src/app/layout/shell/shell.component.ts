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
import { filter, takeUntil } from 'rxjs';

import {
  ExpenseCreateDialogComponent,
  ExpenseCreateDialogData,
  ExpenseCreateDialogResult,
} from '@features/expense/components/expense-create-dialog/expense-create-dialog.component';
import { ExpenseService } from '@features/expense/services/expense.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

interface NavEntry {
  readonly label: string;
  readonly route: string;
  readonly num: string;
  readonly exact?: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, RouterLink, RouterLinkActive, RouterOutlet],
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

  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });

  protected readonly privacyMode = signal(false);

  protected readonly currentRouteLabel = signal('Dashboard');

  protected readonly workspaceNav: readonly NavEntry[] = [
    { label: 'Dashboard', route: '/dashboard', num: '01', exact: true },
    { label: 'Wallets',   route: '/wallets',   num: '02' },
    { label: 'Bullets',   route: '/bullets',   num: '03' },
  ];

  protected readonly activityNav: readonly NavEntry[] = [
    { label: 'Expenses',      route: '/expenses',      num: '04' },
    { label: 'Subscriptions', route: '/subscriptions', num: '05' },
    { label: 'Payments',      route: '/payments',      num: '06' },
  ];

  /** Percentage of wallet budget already committed. */
  protected readonly utilizationRate = computed(() => {
    const wallet = this.selectedWallet();
    if (!wallet || wallet.budget <= 0) return 0;
    const committed = wallet.budget - wallet.remaining;
    return Math.round((committed / wallet.budget) * 100);
  });

  constructor() {
    this.walletService.loadWallets();

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncRouteLabel());

    this.syncRouteLabel();
  }

  protected togglePrivacy(): void {
    const next = !this.privacyMode();
    this.privacyMode.set(next);
    document.body.classList.toggle('ew-privacy', next);
  }

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

    const data: ExpenseCreateDialogData = {
      walletDescription: wallet.description || 'Wallet',
      bullets,
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

  private createExpense(walletId: string, expense: ExpenseCreateDialogResult): void {
    this.expenseService
      .create({
        name: expense.name,
        cost: expense.cost,
        purchaseDate: expense.purchaseDate,
        walletId,
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
