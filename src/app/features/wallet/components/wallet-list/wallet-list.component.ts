import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { Wallet, WalletState } from '../../models/wallet';

@Component({
  selector: 'app-wallet-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe],
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

  protected walletStateClass(state: WalletState): string {
    const map: Record<WalletState, string> = {
      PRODUCTION: 'ew-pill--prod',
      PREVIEW: 'ew-pill--preview',
      REVIEW: 'ew-pill--open',
    };
    return map[state] ?? '';
  }
}
