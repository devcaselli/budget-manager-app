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
import { WalletService } from '@features/wallet/services/wallet.service';

import { BulletBudget, SummaryCard } from '../../models/dashboard.models';

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
  private readonly walletService = inject(WalletService);
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });

  protected readonly isLoadingBullets = toSignal(this.bulletService.loading$, {
    initialValue: false,
  });
  protected readonly errorMessage = toSignal(this.bulletService.error$, {
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

  protected readonly summaryCards = computed<readonly SummaryCard[]>(() => [
    this.balanceCard(),
    this.allocatedCard(),
    this.bulletRemainingCard(),
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

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.bulletService.loadByWalletId(walletId);
    });
  }

  protected refreshDashboard(): void {
    this.bulletService.loadByWalletId(this.selectedWallet()?.id ?? null);
    this.walletService.loadWallets();
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }
}
