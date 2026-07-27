import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { WalletService } from '@features/wallet/services/wallet.service';
import { PayerService } from '../../services/payer.service';
import { Payer } from '../../models/payer';
import {
  PayerCreateDialogComponent,
  PayerCreateDialogResult,
} from '../../components/payer-create-dialog/payer-create-dialog.component';
import {
  PayerEditDialogComponent,
  PayerEditDialogData,
  PayerEditDialogResult,
} from '../../components/payer-edit-dialog/payer-edit-dialog.component';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const TYPE_LABEL: Record<string, string> = {
  STANDING: 'Standing',
  TRANSIENT: 'Transient',
};

/**
 * `activeShareAmount` and `amountDue` are identical by construction today (both derive
 * from `PayerAmountDue.monthly()` server-side) — the field exists to decouple the
 * contract for when `amountDue` may one day include non-share sources, not because the
 * values diverge yet. Rendering the full badge unconditionally would show the same
 * number twice, which reads as a bug. Victor's decision (2026-07-26, improvement-shares
 * frontend-tasks.md Task 6): render conditionally, and this holds even against the
 * direction-c.html design brief where the badge is always-visible-with-value — the
 * design predates the "same source" finding.
 */
export type ShareBadgeState =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'partial'; readonly amount: number };

export function shareBadgeState(activeShareAmount: number, amountDue: number): ShareBadgeState {
  if (activeShareAmount === 0) return { kind: 'none' };
  if (activeShareAmount === amountDue) return { kind: 'all' };
  return { kind: 'partial', amount: activeShareAmount };
}

@Component({
  selector: 'app-payer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, MatIconModule],
  templateUrl: './payer-page.html',
  styleUrl: './payer-page.scss',
})
export class PayerPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly payerService = inject(PayerService);
  private readonly walletService = inject(WalletService);

  protected readonly payers = toSignal(this.payerService.payers$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.payerService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.payerService.saving$, { initialValue: false });
  protected readonly deletingId = toSignal(this.payerService.deleting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.payerService.error$, { initialValue: null });
  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });

  /** null means "All" selected */
  protected readonly selectedPayerId = signal<string | null>(null);

  protected readonly totalCount = computed(() => this.payers().length);

  protected readonly totalAmountDue = computed(() =>
    this.payers().reduce((sum, p) => sum + p.amountDue, 0),
  );

  protected readonly nextPaymentDate = computed(() => {
    const dates = this.payers().map((p) => p.paymentDate).filter(Boolean);
    if (!dates.length) return '—';
    const earliest = [...dates].sort()[0]!;
    return this.formatDate(earliest);
  });

  protected readonly filteredPayers = computed<readonly Payer[]>(() => {
    const id = this.selectedPayerId();
    return id === null ? this.payers() : this.payers().filter((p) => p.id === id);
  });

  protected readonly selectedPayerName = computed(() => {
    const id = this.selectedPayerId();
    if (id === null) return 'all payers';
    return this.payers().find((p) => p.id === id)?.name ?? 'all payers';
  });

  constructor() {
    effect(() => {
      this.selectedPayerId.set(null);
      this.payerService.loadByWalletId(this.selectedWallet()?.id ?? null);
    });
  }

  protected typeLabel(type: string): string {
    return TYPE_LABEL[type] ?? type;
  }

  protected shareBadge(payer: Payer): ShareBadgeState {
    return shareBadgeState(payer.activeShareAmount, payer.amountDue);
  }

  protected formatDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00Z`);
    return DATE_FORMAT.format(date);
  }

  protected selectPayer(id: string | null): void {
    this.selectedPayerId.set(id);
  }

  protected onNewClick(): void {
    this.dialog
      .open<PayerCreateDialogComponent, { walletId: string | null }, PayerCreateDialogResult>(
        PayerCreateDialogComponent,
        {
          width: '30rem',
          maxWidth: 'calc(100vw - 2rem)',
          data: { walletId: this.selectedWallet()?.id ?? null },
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          const request =
            result.type === 'TRANSIENT'
              ? { ...result, walletId: this.selectedWallet()?.id ?? undefined }
              : result;
          this.payerService
            .save(request)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => undefined });
        }
      });
  }

  protected onEditClick(payer: Payer): void {
    const data: PayerEditDialogData = {
      id:             payer.id,
      name:           payer.name,
      type:           payer.type,
      walletId:       payer.walletId,
      selectedWalletId: this.selectedWallet()?.id ?? null,
      paymentDate:    payer.paymentDate,
      subscriptionId: payer.subscriptionId,
    };

    this.dialog
      .open<PayerEditDialogComponent, PayerEditDialogData, PayerEditDialogResult>(
        PayerEditDialogComponent,
        { width: '30rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          const request =
            result.type === 'TRANSIENT'
              ? { ...result, walletId: this.selectedWallet()?.id ?? payer.walletId ?? undefined }
              : { ...result, walletId: undefined };
          this.payerService
            .patch(payer.id, request)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => undefined });
        }
      });
  }

  protected onDeleteClick(payer: Payer): void {
    this.payerService
      .delete(payer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }
}
