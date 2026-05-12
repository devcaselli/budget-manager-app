import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';

import {
  CreditCardDeleteDialogComponent,
  CreditCardDeleteDialogData,
} from '../../components/credit-card-delete-dialog/credit-card-delete-dialog.component';
import { CreditCardService } from '../../services/credit-card.service';
import { CreditCard } from '../../models/credit-card';

interface MonthOption {
  readonly label: string;
  readonly year: number;
  readonly month: number;
}

interface ChartBar {
  readonly label: string;
  readonly heightPct: number;
  readonly isCurrent: boolean;
  readonly total: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

@Component({
  selector: 'app-credit-card-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    BrDatePipe,
    BrlCurrencyPipe,
    MatDialogModule,
    MatIconModule,
    ReactiveFormsModule,
  ],
  templateUrl: './credit-card-page.html',
  styleUrl: './credit-card-page.scss',
})
export class CreditCardPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly creditCardService = inject(CreditCardService);

  private readonly now = new Date();

  protected readonly selectedYear = signal(this.now.getFullYear());
  protected readonly selectedMonth = signal(this.now.getMonth() + 1);
  /**
   * Active card ID for the charges table + bar chart.
   * 'all' = no card selected yet → prompt user to pick a card.
   */
  protected readonly selectedCardId = signal<string>('all');
  protected readonly searchQuery = signal('');

  protected readonly cards = toSignal(this.creditCardService.cards$, { initialValue: [] });
  protected readonly charges = toSignal(this.creditCardService.charges$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.creditCardService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.creditCardService.saving$, { initialValue: false });
  protected readonly deletingId = toSignal(this.creditCardService.deleting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.creditCardService.error$, { initialValue: null });

  protected readonly newCardForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  protected readonly monthOptions = computed<readonly MonthOption[]>(() => {
    const options: MonthOption[] = [];
    const base = new Date(this.now.getFullYear(), this.now.getMonth(), 1);

    for (let i = 11; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      options.push({
        label: `${mm}/${yyyy}`,
        year: yyyy,
        month: d.getMonth() + 1,
      });
    }
    return options;
  });

  protected readonly selectedMonthLabel = computed(() => {
    const opt = this.monthOptions().find(
      (o) => o.year === this.selectedYear() && o.month === this.selectedMonth(),
    );
    return opt?.label ?? '';
  });

  /** Charges filtered for the table (client-side name filter on top of server data) */
  protected readonly filteredCharges = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.charges();
    return this.charges().filter((c) => c.name.toLowerCase().includes(query));
  });

  protected readonly chargesTotal = computed(() =>
    this.filteredCharges().reduce((acc, c) => acc + Number(c.cost), 0),
  );

  protected readonly chargesCount = computed(() => this.filteredCharges().length);

  /** Card name lookup map — O(n) build, O(1) lookup */
  protected readonly cardMap = computed<ReadonlyMap<string, string>>(() =>
    new Map(this.cards().map((c) => [c.id, c.name])),
  );

  /**
   * Bar chart — 12 months ending at selectedMonth.
   * Since the API is per-card-per-month, we only have data for the selected month.
   * We highlight the current bar; the rest show 0 until we add multi-month loading.
   * TODO: load all 12 months in parallel on card selection for a full chart.
   */
  protected readonly chartBars = computed<readonly ChartBar[]>(() => {
    const allCharges = this.charges();
    const currentYear = this.selectedYear();
    const currentMonth = this.selectedMonth();

    const bars: ChartBar[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const label = `${String(m).padStart(2, '0')}/${String(y).slice(2)}`;
      const isCurrent = i === 0;

      // We only have loaded data for the selected month
      const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
      const total = allCharges
        .filter((c) => c.purchaseDate.startsWith(monthPrefix))
        .reduce((acc, c) => acc + Number(c.cost), 0);

      bars.push({ label, heightPct: 0, isCurrent, total });
    }

    const max = Math.max(...bars.map((b) => b.total), 0);
    return bars.map((b) => ({
      ...b,
      heightPct: max > 0 ? Math.max((b.total / max) * 100, b.total > 0 ? 4 : 0) : 0,
    }));
  });

  protected readonly cycleSummary = computed(() => {
    const chartBars = this.chartBars();
    const totals = chartBars.map((b) => b.total);
    const cycleTotal = chartBars.find((b) => b.isCurrent)?.total ?? 0;
    const nonZero = totals.filter((t) => t > 0);
    const avgCycle = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    const peak = Math.max(...totals, 0);
    return { cycleTotal, avgCycle, peak, chargesCount: this.chargesCount() };
  });

  constructor() {
    this.creditCardService.loadAll();
  }

  protected onMonthSelect(year: number, month: number): void {
    this.selectedYear.set(year);
    this.selectedMonth.set(month);
    this.loadChargesForSelection();
  }

  protected onCardSelect(cardId: string): void {
    this.selectedCardId.set(cardId);
    this.searchQuery.set('');
    if (cardId !== 'all') {
      this.loadChargesForSelection();
    } else {
      // clear charges when "all" is re-selected
      this.creditCardService.clearCharges();
    }
  }

  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  protected createCard(): void {
    if (this.newCardForm.invalid) {
      this.newCardForm.markAllAsTouched();
      return;
    }

    const value = this.newCardForm.getRawValue();
    this.creditCardService
      .create({ name: value.name.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.newCardForm.reset({ name: '' }), error: () => undefined });
  }

  protected onDeleteCard(card: CreditCard): void {
    const data: CreditCardDeleteDialogData = { cardName: card.name };

    this.dialog
      .open<CreditCardDeleteDialogComponent, CreditCardDeleteDialogData, boolean>(
        CreditCardDeleteDialogComponent,
        { width: '28rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.deleteCard(card.id);
      });
  }

  protected cardName(creditCardId: string): string {
    return this.cardMap().get(creditCardId) ?? creditCardId;
  }

  private deleteCard(id: string): void {
    this.creditCardService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  private loadChargesForSelection(): void {
    const cardId = this.selectedCardId();
    if (cardId === 'all') return;

    const y = this.selectedYear();
    const m = this.selectedMonth();
    const effectiveMonth = `${y}-${String(m).padStart(2, '0')}`;

    this.creditCardService.loadCharges({ creditCardId: cardId, effectiveMonth });
  }
}
