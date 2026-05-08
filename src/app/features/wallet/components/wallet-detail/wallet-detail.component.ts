import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { BrDatePipe } from '@shared/pipes/br-date.pipe';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { Wallet } from '../../models/wallet';

interface WalletUsage {
  readonly budget: number;
  readonly remaining: number;
  readonly committed: number;
  readonly percent: number;
}

@Component({
  selector: 'app-wallet-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrDatePipe, BrlCurrencyPipe, DecimalPipe, UpperCasePipe],
  templateUrl: './wallet-detail.component.html',
  styleUrl: './wallet-detail.component.scss',
})
export class WalletDetailComponent {
  readonly wallet = input<Wallet | null>(null);
  readonly isLoading = input(false);

  protected readonly usage = computed<WalletUsage | null>(() => {
    const wallet = this.wallet();
    if (!wallet) return null;

    const budget = Number(wallet.budget);
    const remaining = Number(wallet.remaining);
    const committed = Math.max(budget - remaining, 0);
    const percent = budget > 0 ? Math.min((committed / budget) * 100, 100) : 0;

    return { budget, remaining, committed, percent };
  });
}
