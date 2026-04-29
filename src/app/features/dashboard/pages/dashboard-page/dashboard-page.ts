import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

import { BulletService } from '@features/bullet/services/bullet.service';
import { ExpenseService } from '@features/expense/services/expense.service';
import { WalletService } from '@features/wallet/services/wallet.service';

import { BulletBudget, ExpenseUsage, SummaryCard } from '../../models/dashboard.models';

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    PageHeaderComponent,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly bulletService = inject(BulletService);
  private readonly expenseService = inject(ExpenseService);
  private readonly walletService = inject(WalletService);
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });

  protected readonly isLoadingBullets = toSignal(this.bulletService.loading$, {
    initialValue: false,
  });
  protected readonly isLoadingExpenses = toSignal(this.expenseService.loading$, {
    initialValue: false,
  });
  protected readonly bulletErrorMessage = toSignal(this.bulletService.error$, {
    initialValue: null,
  });
  protected readonly expenseErrorMessage = toSignal(this.expenseService.error$, {
    initialValue: null,
  });

  protected readonly wallet = this.selectedWallet;

  private readonly balanceCard = computed<SummaryCard>(() => {
    const wallet = this.selectedWallet();

    return {
      label: 'Disponivel na wallet',
      value: this.formatCurrency(wallet?.remaining ?? 0),
      icon: 'savings',
      helper: wallet?.description || '-',
    };
  });

  private readonly allocatedCard = computed<SummaryCard>(() => {
    const allocated = this.bullets().reduce((total, bullet) => total + Number(bullet.budget), 0);

    return {
      label: 'Alocado em bullets',
      value: this.formatCurrency(allocated),
      icon: 'target',
      helper: `${this.bullets().length} bullet(s)`,
    };
  });

  private readonly bulletRemainingCard = computed<SummaryCard>(() => {
    const remaining = this.bullets().reduce(
      (total, bullet) => total + Number(bullet.remaining),
      0,
    );

    return {
      label: 'Disponivel nos bullets',
      value: this.formatCurrency(remaining),
      icon: 'account_balance',
      helper: 'Saldo por categoria',
    };
  });

  private readonly openExpensesCard = computed<SummaryCard>(() => {
    const remaining = this.expenses().reduce(
      (total, expense) => total + Number(expense.remaining),
      0,
    );

    return {
      label: 'Em aberto nas expenses',
      value: this.formatCurrency(remaining),
      icon: 'receipt_long',
      helper: `${this.expenses().length} expense(s)`,
    };
  });

  protected readonly summaryCards = computed<readonly SummaryCard[]>(() => [
    this.balanceCard(),
    this.allocatedCard(),
    this.bulletRemainingCard(),
    this.openExpensesCard(),
  ]);

  protected readonly bulletBudgets = computed<readonly BulletBudget[]>(() =>
    this.bullets().map((bullet) => {
      const budget = Number(bullet.budget);
      const remaining = Number(bullet.remaining);
      const spent = Math.max(budget - remaining, 0);
      const progress = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;

      return {
        id: bullet.id,
        name: bullet.description,
        spent: this.formatCurrency(spent),
        limit: this.formatCurrency(budget),
        remaining: this.formatCurrency(remaining),
        progress,
      };
    }),
  );

  protected readonly expenseUsages = computed<readonly ExpenseUsage[]>(() =>
    this.expenses().map((expense) => {
      const cost = Number(expense.cost);
      const remaining = Number(expense.remaining);
      const paid = Math.max(cost - remaining, 0);
      const progress = cost > 0 ? Math.min((paid / cost) * 100, 100) : 0;

      return {
        id: expense.id,
        name: expense.name,
        paid: this.formatCurrency(paid),
        cost: this.formatCurrency(cost),
        remaining: this.formatCurrency(remaining),
        purchaseDate: this.formatDate(expense.purchaseDate),
        progress,
      };
    }),
  );

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.bulletService.loadByWalletId(walletId);
      this.expenseService.loadByWalletId(walletId);
    });
  }

  protected refreshDashboard(): void {
    const walletId = this.selectedWallet()?.id ?? null;

    this.bulletService.loadByWalletId(walletId);
    this.expenseService.loadByWalletId(walletId);
    this.walletService.loadWallets();
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
  }
}
