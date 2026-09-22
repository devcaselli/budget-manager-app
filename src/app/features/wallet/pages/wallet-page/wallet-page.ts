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
  WalletConfirmDialogComponent,
  WalletConfirmDialogData,
} from '../../components/wallet-confirm-dialog/wallet-confirm-dialog.component';
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
    const description = wallet.description ?? 'Unnamed';
    const data: WalletConfirmDialogData = {
      titlePrefix: 'Send to',
      titleEmphasis: 'review?',
      subtitle: 'This action cannot be undone',
      message: `You are about to send the wallet ${description} to review. It will become read-only and cannot be reopened afterward.`,
      confirmLabel: 'Send to review',
      confirmIcon: 'lock_outline',
      tone: 'danger',
    };

    this.openConfirmDialog(data).subscribe((confirmed) => {
      if (confirmed) this.sendToReview(wallet.id);
    });
  }

  protected onReopenWallet(wallet: Wallet): void {
    const description = wallet.description ?? 'Unnamed';
    const data: WalletConfirmDialogData = {
      titlePrefix: 'Reopen',
      titleEmphasis: 'wallet?',
      subtitle: 'It will accept new spending again',
      message: `You are about to reopen the wallet ${description}. It will leave the closed state and be spendable again.`,
      confirmLabel: 'Reopen wallet',
      confirmIcon: 'lock_open',
      tone: 'positive',
    };

    this.openConfirmDialog(data).subscribe((confirmed) => {
      if (confirmed) this.reopenWallet(wallet.id);
    });
  }

  protected onPromoteWallet(wallet: Wallet): void {
    const description = wallet.description ?? 'Unnamed';
    const data: WalletConfirmDialogData = {
      titlePrefix: 'Move to',
      titleEmphasis: 'production?',
      subtitle: 'This becomes the active wallet for its month',
      message: `You are about to move the wallet ${description} from preview to production.`,
      confirmLabel: 'Move to production',
      confirmIcon: 'rocket_launch',
      tone: 'positive',
    };

    this.openConfirmDialog(data).subscribe((confirmed) => {
      if (confirmed) this.promoteWallet(wallet.id);
    });
  }

  private openConfirmDialog(data: WalletConfirmDialogData) {
    return this.dialog
      .open<WalletConfirmDialogComponent, WalletConfirmDialogData, boolean>(
        WalletConfirmDialogComponent,
        { width: '28rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef));
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

  private reopenWallet(id: string): void {
    this.walletService
      .reopen(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.walletService.loadWallets(),
        error: () => undefined,
      });
  }

  private promoteWallet(id: string): void {
    this.walletService
      .promoteToProduction(id)
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
