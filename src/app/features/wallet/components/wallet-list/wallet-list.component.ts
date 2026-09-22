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
  readonly favoriteWalletId = input<string | null>(null);
  readonly isLoading = input(false);
  readonly walletSelect = output<Wallet>();
  readonly favoriteToggle = output<Wallet>();
  readonly walletReview = output<Wallet>();
  readonly walletReopen = output<Wallet>();
  readonly walletPromote = output<Wallet>();

  protected isSelected(wallet: Wallet): boolean {
    return this.selectedWalletId() === wallet.id;
  }

  protected isFavorite(wallet: Wallet): boolean {
    return this.favoriteWalletId() === wallet.id;
  }

  protected onFavoriteClick(event: Event, wallet: Wallet): void {
    event.stopPropagation();
    this.favoriteToggle.emit(wallet);
  }

  protected onReviewClick(event: Event, wallet: Wallet): void {
    event.stopPropagation();
    this.walletReview.emit(wallet);
  }

  protected onReopenClick(event: Event, wallet: Wallet): void {
    event.stopPropagation();
    this.walletReopen.emit(wallet);
  }

  protected onPromoteClick(event: Event, wallet: Wallet): void {
    event.stopPropagation();
    this.walletPromote.emit(wallet);
  }

  protected canReview(wallet: Wallet): boolean {
    return wallet.state === 'PRODUCTION' && !wallet.closed;
  }

  protected canReopen(wallet: Wallet): boolean {
    return wallet.state === 'PRODUCTION' && wallet.closed;
  }

  protected canPromote(wallet: Wallet): boolean {
    return wallet.state === 'PREVIEW';
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
