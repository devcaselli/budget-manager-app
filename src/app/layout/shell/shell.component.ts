import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntil } from 'rxjs';

import { APP_NAVIGATION } from '@core/config/app-navigation';
import { APP_NAME } from '@core/config/app-config';
import {
  ExpenseCreateDialogComponent,
  ExpenseCreateDialogResult,
} from '@features/expense/components/expense-create-dialog/expense-create-dialog.component';
import { ExpenseService } from '@features/expense/services/expense.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrlCurrencyPipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly expenseService = inject(ExpenseService);
  private readonly walletService = inject(WalletService);

  protected readonly isHandset = signal(false);
  protected readonly appName = APP_NAME;
  protected readonly navItems = APP_NAVIGATION;
  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  constructor() {
    this.walletService.loadWallets();

    this.breakpointObserver
      .observe([Breakpoints.Handset])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.isHandset.set(result.matches));
  }

  protected openTransactionDialog(): void {
    const wallet = this.selectedWallet();

    if (!wallet) {
      return;
    }

    const dialogRef = this.dialog
      .open<
        ExpenseCreateDialogComponent,
        { walletDescription: string },
        ExpenseCreateDialogResult
      >(ExpenseCreateDialogComponent, {
        width: '30rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: {
          walletDescription: wallet.description || 'Wallet sem descricao',
        },
      });

    dialogRef.componentInstance.submitted
      .pipe(takeUntil(dialogRef.afterClosed()), takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.createExpense(wallet.id, result));

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.createExpense(wallet.id, result);
        }
      });
  }

  private createExpense(walletId: string, expense: ExpenseCreateDialogResult): void {
    this.expenseService
      .create({
        ...expense,
        walletId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.expenseService.loadByWalletId(walletId),
        error: () => undefined,
      });
  }
}
