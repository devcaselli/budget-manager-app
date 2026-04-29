import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

import { WalletService } from '@features/wallet/services/wallet.service';

import { BudgetCategory, SummaryCard } from '../../models/dashboard.models';

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
  private readonly walletService = inject(WalletService);
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  protected readonly balanceCard = computed<SummaryCard>(() => {
    const wallet = this.selectedWallet();

    return {
      label: 'Saldo atual',
      value: this.formatCurrency(wallet?.remaining ?? 0),
      icon: 'savings',
      helper: wallet?.description || '-',
    };
  });

  protected readonly summaryCards = computed<readonly SummaryCard[]>(() => [
    this.balanceCard(),
    // TODO: adicionar cards reais de receitas e despesas quando essas features existirem.
  ]);

  protected readonly budgetCategories: readonly BudgetCategory[] = [
    {
      name: 'Moradia',
      spent: 'R$ 1.850,00',
      limit: 'R$ 2.200,00',
      progress: 84,
    },
    {
      name: 'Alimentacao',
      spent: 'R$ 940,00',
      limit: 'R$ 1.400,00',
      progress: 67,
    },
    {
      name: 'Transporte',
      spent: 'R$ 410,00',
      limit: 'R$ 700,00',
      progress: 59,
    },
  ];

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }
}
