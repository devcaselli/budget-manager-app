import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

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
  protected readonly summaryCards: readonly SummaryCard[] = [
    {
      label: 'Saldo atual',
      value: 'R$ 8.420,00',
      icon: 'savings',
      helper: '+12% vs. mes anterior',
    },
    {
      label: 'Receitas',
      value: 'R$ 12.300,00',
      icon: 'trending_up',
      helper: '3 fontes ativas',
    },
    {
      label: 'Despesas',
      value: 'R$ 3.880,00',
      icon: 'receipt_long',
      helper: '68 lancamentos',
    },
  ];

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
}
