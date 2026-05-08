import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  OnInit,
} from '@angular/core';
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
}

const MONTH_BARS: readonly MonthBar[] = [
  { label: 'Jun', height: '35%' },
  { label: 'Jul', height: '48%' },
  { label: 'Aug', height: '42%' },
  { label: 'Sep', height: '60%' },
  { label: 'Oct', height: '55%' },
  { label: 'Nov', height: '70%' },
  { label: 'Dec', height: '65%' },
  { label: 'Jan', height: '80%' },
  { label: 'Feb', height: '72%' },
  { label: 'Mar', height: '85%' },
  { label: 'Apr', height: '90%' },
  { label: 'May', height: '25%' },
];

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, BrDatePipe],
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

  /** Static chart data */
  protected readonly monthBars: readonly MonthBar[] = MONTH_BARS;

  /** Heatmap cells (371 = 53 * 7) */
  protected readonly heatmapCells: readonly string[] = this.buildHeatmap();

  /** Topbar sync for refresh timestamp */
  protected readonly lastSync = signal('—');

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
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(spent);
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
    const fmt = (v: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    return [
      {
        label: 'used',
        sublabel: `used · ${fmt(used)}`,
        value: fmt(used),
        color: '#d6a371',
      },
      {
        label: 'available',
        sublabel: 'untouched',
        value: fmt(free),
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

  private buildHeatmap(): readonly string[] {
    const cells: string[] = [];
    const levels = ['', 'l1', 'l2', 'l3', 'l4'];
    const weights = [0.55, 0.23, 0.12, 0.07, 0.03];

    for (let i = 0; i < 53 * 7; i++) {
      const r = Math.random();
      let acc = 0;
      let cls = '';
      for (let l = 0; l < weights.length; l++) {
        acc += weights[l];
        if (r < acc) {
          cls = levels[l];
          break;
        }
      }
      cells.push(cls);
    }

    return cells;
  }
}
