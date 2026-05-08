import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';

import { BulletService } from '@features/bullet/services/bullet.service';
import { ExpenseService } from '@features/expense/services/expense.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';

interface DonutLegendItem {
  readonly label: string;
  readonly sublabel: string;
  readonly value: string;
  readonly color: string;
}

interface RecentExpense {
  readonly id: string;
  readonly name: string;
  readonly purchaseDate: string;
  readonly cost: number;
  readonly bulletLabel: string;
  readonly statusLabel: string;
}

interface MonthBar {
  readonly label: string;
  readonly height: string;
  readonly total: number;
}

interface SpendingPoint extends MonthBar {
  readonly x: number;
  readonly y: number;
}

interface HeatmapCell {
  readonly className: string;
  readonly label: string;
}

type ChartMode = 'line' | 'bars';

const CHART_WIDTH = 600;
const CHART_HEIGHT = 220;
const CHART_LEFT = 28;
const CHART_RIGHT = 572;
const CHART_TOP = 24;
const CHART_BOTTOM = 186;
const MONTHS_IN_SERIES = 12;

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, BrDatePipe, UpperCasePipe],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit {
  private readonly bulletService = inject(BulletService);
  private readonly expenseService = inject(ExpenseService);
  private readonly walletService = inject(WalletService);

  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });

  protected readonly isLoadingExpenses = toSignal(this.expenseService.loading$, {
    initialValue: false,
  });

  protected readonly wallet = this.selectedWallet;

  protected readonly chartMode = signal<ChartMode>('line');
  protected readonly hoveredSpendingPoint = signal<SpendingPoint | null>(null);

  /** Topbar sync for refresh timestamp */
  protected readonly lastSync = signal('—');

  protected readonly spendingPoints = computed<readonly SpendingPoint[]>(() => {
    const months = this.lastTwelveMonths();
    const totalsByMonth = new Map<string, number>();

    for (const expense of this.expenses()) {
      const date = this.parseDate(expense.purchaseDate);
      if (!date) continue;
      const key = this.monthKey(date);
      totalsByMonth.set(key, (totalsByMonth.get(key) ?? 0) + Number(expense.cost));
    }

    const totals = months.map((month) => totalsByMonth.get(month.key) ?? 0);
    const max = Math.max(...totals, 0);
    const usableHeight = CHART_BOTTOM - CHART_TOP;
    const chartInnerWidth = CHART_RIGHT - CHART_LEFT;
    const step = MONTHS_IN_SERIES > 1 ? chartInnerWidth / (MONTHS_IN_SERIES - 1) : chartInnerWidth;

    return months.map((month, index) => {
      const total = totals[index];
      const ratio = max > 0 ? total / max : 0;
      return {
        label: month.label,
        total,
        height: `${Math.max(ratio * 100, total > 0 ? 4 : 0)}%`,
        x: Math.round(CHART_LEFT + index * step),
        y: Math.round(CHART_BOTTOM - ratio * usableHeight),
      };
    });
  });

  protected readonly monthBars = computed<readonly MonthBar[]>(() =>
    this.spendingPoints().map(({ label, total, height }) => ({ label, total, height })),
  );

  protected readonly spendingLinePath = computed(() => {
    const points = this.spendingPoints();
    if (!points.length) return '';
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  });

  protected readonly spendingAreaPath = computed(() => {
    const line = this.spendingLinePath();
    if (!line) return '';
    return `${line} L${CHART_RIGHT},${CHART_BOTTOM} L${CHART_LEFT},${CHART_BOTTOM} Z`;
  });

  protected readonly spendingMaxLabel = computed(() =>
    this.formatCurrency(Math.max(...this.spendingPoints().map((point) => point.total), 0)),
  );

  protected readonly heatmapYear = computed(() => {
    const wallet = this.selectedWallet();
    return wallet?.effectiveMonth ? this.parseMonth(wallet.effectiveMonth).getFullYear() : new Date().getFullYear();
  });

  protected readonly heatmapCells = computed<readonly HeatmapCell[]>(() => {
    const year = this.heatmapYear();
    const firstDay = new Date(Date.UTC(year, 0, 1));
    const gridStart = new Date(firstDay);
    gridStart.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay());

    const totalsByDay = new Map<string, { count: number; total: number }>();
    for (const expense of this.expenses()) {
      const date = this.parseDate(expense.purchaseDate);
      if (!date || date.getUTCFullYear() !== year) continue;
      const key = this.dayKey(date);
      const current = totalsByDay.get(key) ?? { count: 0, total: 0 };
      totalsByDay.set(key, {
        count: current.count + 1,
        total: current.total + Number(expense.cost),
      });
    }

    const cells: HeatmapCell[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let week = 0; week < 53; week++) {
        const date = new Date(gridStart);
        date.setUTCDate(gridStart.getUTCDate() + week * 7 + weekday);
        const inYear = date.getUTCFullYear() === year;
        const activity = inYear ? totalsByDay.get(this.dayKey(date)) : null;
        const count = activity?.count ?? 0;
        cells.push({
          className: inYear ? this.heatmapLevel(count) : 'is-outside',
          label: inYear
            ? `${this.formatHeatmapDate(date)} · ${count} transaction${count === 1 ? '' : 's'} · ${this.formatCurrency(activity?.total ?? 0)}`
            : '',
        });
      }
    }

    return cells;
  });

  protected setChartMode(mode: ChartMode): void {
    this.chartMode.set(mode);
  }

  protected showSpendingTooltip(point: SpendingPoint): void {
    this.hoveredSpendingPoint.set(point);
  }

  protected hideSpendingTooltip(): void {
    this.hoveredSpendingPoint.set(null);
  }

  protected tooltipX(point: SpendingPoint): number {
    if (point.x > CHART_WIDTH - 130) return point.x - 120;
    return point.x + 12;
  }

  protected tooltipY(point: SpendingPoint): number {
    return Math.max(CHART_TOP, point.y - 52);
  }

  // ── Hero computed values ──────────────────────────────────────────────────

  protected readonly committed = computed(() => {
    const wallet = this.selectedWallet();
    if (!wallet) return 0;
    return Math.max(wallet.budget - wallet.remaining, 0);
  });

  protected readonly lastMoveDate = computed(() => {
    const expenses = this.expenses();
    if (!expenses.length) return '—';
    const sorted = [...expenses].sort(
      (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime(),
    );
    return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(
      new Date(`${sorted[0].purchaseDate}T00:00:00Z`),
    );
  });

  protected readonly bulletsCap = computed(() =>
    this.bullets().reduce((acc, b) => acc + Number(b.budget), 0),
  );

  protected readonly bulletsFree = computed(() =>
    this.bullets().reduce((acc, b) => acc + Number(b.remaining), 0),
  );

  protected readonly bulletsCount = computed(() => this.bullets().length);

  protected readonly bulletsSpentLabel = computed(() => {
    const spent = this.bulletsCap() - this.bulletsFree();
    if (spent <= 0) return 'nothing spent';
    const formatted = this.formatCurrency(spent);
    return `↓ ${formatted} spent`;
  });

  protected readonly openExpenses = computed(() =>
    this.expenses().reduce((acc, e) => acc + Number(e.remaining), 0),
  );

  protected readonly utilizationPct = computed(() => {
    const cap = this.bulletsCap();
    if (cap <= 0) return 0;
    const spent = cap - this.bulletsFree();
    return Math.round(Math.min((spent / cap) * 100, 100));
  });

  /** stroke-dasharray = 276; offset encodes the unused arc */
  protected readonly donutOffset = computed(() => {
    const pct = this.utilizationPct();
    return 276 - (276 * pct) / 100;
  });

  protected readonly donutLegend = computed<readonly DonutLegendItem[]>(() => {
    const cap = this.bulletsCap();
    const free = this.bulletsFree();
    const used = cap - free;
    return [
      {
        label: 'used',
        sublabel: `used · ${this.formatCurrency(used)}`,
        value: this.formatCurrency(used),
        color: '#d6a371',
      },
      {
        label: 'available',
        sublabel: 'untouched',
        value: this.formatCurrency(free),
        color: '#3a3128',
      },
    ];
  });

  protected readonly recentExpenses = computed<readonly RecentExpense[]>(() =>
    this.expenses()
      .slice()
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        name: e.name,
        purchaseDate: e.purchaseDate,
        cost: Number(e.cost),
        bulletLabel: '—',
        statusLabel: Number(e.remaining) <= 0 ? 'paid' : 'open',
      })),
  );

  // ── Page header computed values ───────────────────────────────────────────

  protected readonly currentCycle = computed(() => {
    const wallet = this.selectedWallet();
    return wallet?.effectiveMonth ?? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  });

  protected readonly headlineText = computed(() => {
    const wallet = this.selectedWallet();
    if (!wallet) return 'No wallet selected';
    const pct = Math.round(((wallet.budget - wallet.remaining) / wallet.budget) * 100);
    if (pct < 20) return 'A quiet month';
    if (pct < 50) return 'Building momentum';
    if (pct < 80) return 'Halfway through';
    return 'Almost there';
  });

  protected readonly summaryText = computed(() => {
    const pct = this.utilizationPct();
    const count = this.bulletsCount();
    const open = this.openExpenses();
    return `${pct}% of the cycle is committed. ${count} bullet(s) active${open <= 0 ? ', all expenses settled' : `, R$ ${open.toFixed(2)} in open expenses`}.`;
  });

  protected readonly daysLeft = computed(() => {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return endOfMonth.getDate() - now.getDate();
  });

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.bulletService.loadByWalletId(walletId);
      this.expenseService.loadByWalletId(walletId);
    });
  }

  ngOnInit(): void {
    this.updateLastSync();
  }

  private updateLastSync(): void {
    this.lastSync.set('just now');
  }

  private lastTwelveMonths(): readonly { readonly key: string; readonly label: string }[] {
    const wallet = this.selectedWallet();
    const anchor = wallet?.effectiveMonth
      ? this.parseMonth(wallet.effectiveMonth)
      : new Date();
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - (MONTHS_IN_SERIES - 1), 1);

    return Array.from({ length: MONTHS_IN_SERIES }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
      return {
        key: this.monthKey(date),
        label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date),
      };
    });
  }

  private parseDate(value: string): Date | null {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseMonth(value: string): Date {
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return new Date();
    return new Date(year, month - 1, 1);
  }

  private monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private dayKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  private heatmapLevel(count: number): string {
    if (count <= 0) return '';
    if (count === 1) return 'l1';
    if (count === 2) return 'l2';
    if (count === 3) return 'l3';
    return 'l4';
  }

  private formatHeatmapDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
}
