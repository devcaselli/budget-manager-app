import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';

import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

import { WalletDetailComponent } from '../../components/wallet-detail/wallet-detail.component';
import { WalletFormComponent } from '../../components/wallet-form/wallet-form.component';
import { WalletListComponent } from '../../components/wallet-list/wallet-list.component';
import { CreateWalletRequest, Wallet } from '../../models/wallet';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-wallet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    PageHeaderComponent,
    WalletDetailComponent,
    WalletFormComponent,
    WalletListComponent,
  ],
  templateUrl: './wallet-page.html',
  styleUrl: './wallet-page.scss',
})
export class WalletPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly walletService = inject(WalletService);

  protected readonly wallets = signal<readonly Wallet[]>([]);
  protected readonly selectedWallet = signal<Wallet | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly isLoadingDetails = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly formResetCount = signal(0);

  constructor() {
    this.loadWallets();
  }

  protected loadWallets(): void {
    this.errorMessage.set(null);
    this.isLoading.set(true);

    this.walletService
      .findAll()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: (wallets) => {
          this.wallets.set(wallets);

          const selected = this.selectedWallet();
          if (!selected && wallets.length > 0) {
            this.selectWallet(wallets[0]);
          }
        },
        error: () => this.errorMessage.set('Nao foi possivel carregar as wallets.'),
      });
  }

  protected selectWallet(wallet: Wallet): void {
    if (this.selectedWallet()?.id === wallet.id) {
      return;
    }

    this.selectedWallet.set(wallet);
    this.errorMessage.set(null);
    this.isLoadingDetails.set(true);

    this.walletService
      .findById(wallet.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoadingDetails.set(false)),
      )
      .subscribe({
        next: (details) => this.selectedWallet.set(details),
        error: () => this.errorMessage.set('Nao foi possivel carregar os detalhes da wallet.'),
      });
  }

  protected createWallet(request: CreateWalletRequest): void {
    this.errorMessage.set(null);
    this.isSaving.set(true);

    this.walletService
      .create(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: (wallet) => {
          this.wallets.update((wallets) => [wallet, ...wallets]);
          this.selectedWallet.set(wallet);
          this.formResetCount.update((count) => count + 1);
        },
        error: () => this.errorMessage.set('Nao foi possivel abrir a wallet.'),
      });
  }
}
