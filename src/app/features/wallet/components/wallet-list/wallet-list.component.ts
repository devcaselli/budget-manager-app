import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { BrDatePipe } from '@shared/pipes/br-date.pipe';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { Wallet } from '../../models/wallet';

@Component({
  selector: 'app-wallet-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrDatePipe, BrlCurrencyPipe, MatIconModule, MatProgressBarModule],
  templateUrl: './wallet-list.component.html',
  styleUrl: './wallet-list.component.scss',
})
export class WalletListComponent {
  readonly wallets = input.required<readonly Wallet[]>();
  readonly selectedWalletId = input<string | null>(null);
  readonly isLoading = input(false);
  readonly walletSelect = output<Wallet>();

  protected isSelected(wallet: Wallet): boolean {
    return this.selectedWalletId() === wallet.id;
  }
}
