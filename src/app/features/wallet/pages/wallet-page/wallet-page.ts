import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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

  protected readonly wallets = toSignal(this.walletService.wallets$, { initialValue: [] });
  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  protected readonly isLoading = toSignal(this.walletService.loading$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.walletService.error$, { initialValue: null });
  protected readonly isSaving = signal(false);
  protected readonly formResetCount = signal(0);

  protected refreshWallets(): void {
    this.walletService.loadWallets();
  }

  protected selectWallet(wallet: Wallet): void {
    this.walletService.selectWallet(wallet);
  }

  protected createWallet(request: CreateWalletRequest): void {
    this.isSaving.set(true);

    this.walletService
      .create(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: () => this.formResetCount.update((count) => count + 1),
        error: () => undefined,
      });
  }
}
