import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { finalize } from 'rxjs';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { WalletDetailComponent } from '../../components/wallet-detail/wallet-detail.component';
import { WalletFormComponent } from '../../components/wallet-form/wallet-form.component';
import { WalletListComponent } from '../../components/wallet-list/wallet-list.component';
import {
  WalletReviewDialogComponent,
  WalletReviewDialogData,
} from '../../components/wallet-review-dialog/wallet-review-dialog.component';
import { CreateWalletRequest, Wallet } from '../../models/wallet';
import { WalletService } from '../../services/wallet.service';
import { PreferencesService } from '@core/services/preferences.service';

@Component({
  selector: 'app-wallet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, WalletDetailComponent, WalletFormComponent, WalletListComponent],
  templateUrl: './wallet-page.html',
  styleUrl: './wallet-page.scss',
})
export class WalletPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly walletService = inject(WalletService);
  private readonly preferences = inject(PreferencesService);
  private readonly dialog = inject(MatDialog);

  protected readonly favoriteWalletId = this.preferences.favoriteWalletId;

  protected readonly wallets = toSignal(this.walletService.wallets$, { initialValue: [] });
  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  protected readonly isLoading = toSignal(this.walletService.loading$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.walletService.error$, { initialValue: null });
  protected readonly isSaving = signal(false);
  protected readonly formResetCount = signal(0);

  protected readonly totalCap = computed(() =>
    this.wallets().reduce((acc, w) => acc + Number(w.budget), 0),
  );

  protected selectWallet(wallet: Wallet): void {
    this.walletService.selectWallet(wallet);
  }

  protected toggleFavorite(wallet: Wallet): void {
    this.preferences.toggleFavoriteWallet(wallet.id);
  }

  protected onReviewWallet(wallet: Wallet): void {
    const data: WalletReviewDialogData = { walletDescription: wallet.description ?? 'Unnamed' };

    this.dialog
      .open<WalletReviewDialogComponent, WalletReviewDialogData, boolean>(
        WalletReviewDialogComponent,
        { width: '28rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.sendToReview(wallet.id);
      });
  }

  private sendToReview(id: string): void {
    const closedDate = new Date().toISOString();

    this.walletService
      .patch(id, { state: 'REVIEW', closed: true, closedDate })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.walletService.loadWallets(),
        error: () => undefined,
      });
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
