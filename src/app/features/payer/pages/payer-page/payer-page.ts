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
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
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
  INDIVIDUAL: 'Individual',
  COMPANY:    'Company',
  DEPENDENT:  'Dependent',
  OTHER:      'Other',
};

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

  protected readonly payers = toSignal(this.payerService.payers$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.payerService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.payerService.saving$, { initialValue: false });
  protected readonly deletingId = toSignal(this.payerService.deleting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.payerService.error$, { initialValue: null });

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
    this.payerService.load();
  }

  protected typeLabel(type: string): string {
    return TYPE_LABEL[type] ?? type;
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
      .open<PayerCreateDialogComponent, undefined, PayerCreateDialogResult>(
        PayerCreateDialogComponent,
        { width: '30rem', maxWidth: 'calc(100vw - 2rem)' },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.payerService
            .save(result)
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
          this.payerService
            .patch(payer.id, result)
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
