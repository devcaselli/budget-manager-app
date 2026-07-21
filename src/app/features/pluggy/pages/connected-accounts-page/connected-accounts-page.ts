import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, take, takeWhile, timer } from 'rxjs';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';

import {
  MaterializeResult,
  PluggyConnection,
  PluggyItemStatus,
  PluggyTransactionPreview,
} from '../../models/pluggy';
import { PluggyService } from '../../services/pluggy.service';
import { PluggyWidgetService } from '../../services/pluggy-widget.service';

/** Poll every 2.5s, capped at 24 attempts (~60s). */
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 24;

/** Terminal statuses that require the user to act — stop polling and warn. */
const TERMINAL_ERROR_STATUSES: readonly PluggyItemStatus[] = [
  'LOGIN_ERROR',
  'WAITING_USER_INPUT',
  'OUTDATED',
];

@Component({
  selector: 'app-connected-accounts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, BrDatePipe],
  templateUrl: './connected-accounts-page.html',
  styleUrl: './connected-accounts-page.scss',
})
export class ConnectedAccountsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly pluggyService = inject(PluggyService);
  private readonly pluggyWidget = inject(PluggyWidgetService);

  protected readonly connections = toSignal(this.pluggyService.connections$, { initialValue: [] });
  protected readonly transactions = toSignal(this.pluggyService.transactions$, {
    initialValue: [],
  });
  protected readonly isLoading = toSignal(this.pluggyService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.pluggyService.saving$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.pluggyService.error$, { initialValue: null });

  protected readonly selectedItemId = signal<string | null>(null);
  /** Set of transaction ids the user has checked for import. */
  protected readonly selectedTxIds = signal<ReadonlySet<string>>(new Set());
  protected readonly lastResult = signal<MaterializeResult | null>(null);

  /** itemId currently being re-synced via update mode (null = idle). */
  protected readonly syncingItemId = signal<string | null>(null);
  protected readonly syncMessage = signal<string | null>(null);
  protected readonly syncError = signal<string | null>(null);

  /** A transaction is importable only when it's an outgoing expense and not yet imported. */
  protected readonly selectableTransactions = computed(() =>
    this.transactions().filter((tx) => tx.isExpense && !tx.alreadyImported),
  );

  protected readonly allSelectableChecked = computed(() => {
    const selectable = this.selectableTransactions();
    if (selectable.length === 0) {
      return false;
    }
    const selected = this.selectedTxIds();
    return selectable.every((tx) => selected.has(tx.id));
  });

  protected readonly selectedCount = computed(() => this.selectedTxIds().size);

  constructor() {
    this.pluggyService.loadConnections();
  }

  protected selectConnection(connection: PluggyConnection): void {
    if (this.selectedItemId() === connection.itemId) {
      return;
    }
    this.selectedItemId.set(connection.itemId);
    this.selectedTxIds.set(new Set());
    this.lastResult.set(null);
    this.pluggyService.loadTransactions(connection.itemId);
  }

  protected isSelectable(tx: PluggyTransactionPreview): boolean {
    return tx.isExpense && !tx.alreadyImported;
  }

  protected isChecked(tx: PluggyTransactionPreview): boolean {
    return this.selectedTxIds().has(tx.id);
  }

  protected toggleTransaction(tx: PluggyTransactionPreview): void {
    if (!this.isSelectable(tx)) {
      return;
    }
    const next = new Set(this.selectedTxIds());
    if (next.has(tx.id)) {
      next.delete(tx.id);
    } else {
      next.add(tx.id);
    }
    this.selectedTxIds.set(next);
  }

  protected toggleSelectAll(): void {
    if (this.allSelectableChecked()) {
      this.selectedTxIds.set(new Set());
      return;
    }
    this.selectedTxIds.set(new Set(this.selectableTransactions().map((tx) => tx.id)));
  }

  protected importSelected(): void {
    const itemId = this.selectedItemId();
    const ids = [...this.selectedTxIds()];
    if (!itemId || ids.length === 0) {
      return;
    }
    this.runMaterialize(itemId, { transactionIds: ids });
  }

  protected importAll(): void {
    const itemId = this.selectedItemId();
    if (!itemId) {
      return;
    }
    this.runMaterialize(itemId, { all: true });
  }

  /** True while the given connection is being re-synced. */
  protected isSyncing(itemId: string): boolean {
    return this.syncingItemId() === itemId;
  }

  /**
   * "Atualizar dados": re-sync an existing item via the widget's UPDATE MODE,
   * then poll its status until fresh and reload transactions.
   */
  protected refreshConnection(connection: PluggyConnection): void {
    const itemId = connection.itemId;
    if (this.syncingItemId()) {
      return;
    }

    this.syncingItemId.set(itemId);
    this.syncMessage.set('Sincronizando…');
    this.syncError.set(null);

    this.pluggyService
      .getConnectToken(itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (token) => this.openUpdateWidget(token, itemId),
        error: () => this.failSync('Não foi possível iniciar a atualização.'),
      });
  }

  private openUpdateWidget(token: string, itemId: string): void {
    this.pluggyWidget
      .openUpdate(token, itemId, {
        // Widget UI finished — data is NOT fresh yet, so start polling.
        onSuccess: () => this.pollUntilUpdated(itemId),
        onError: () => this.failSync('O widget do Pluggy retornou um erro.'),
        onExit: () => {
          // Only cancel if the user closed before onSuccess kicked off polling.
          if (this.syncMessage() === 'Sincronizando…') {
            this.resetSync();
          }
        },
      })
      .catch(() => this.failSync('Não foi possível abrir o widget de atualização.'));
  }

  /**
   * Polls GET /pluggy/items/{itemId}/status every 2.5s (cap ~60s) until UPDATED.
   * Stops early on terminal error statuses. Cancelled on destroy.
   */
  private pollUntilUpdated(itemId: string): void {
    timer(0, POLL_INTERVAL_MS)
      .pipe(
        take(POLL_MAX_ATTEMPTS),
        switchMap(() => this.pluggyService.getItemStatus(itemId)),
        // Emit UPDATED/terminal too (inclusive) so the subscriber can react.
        takeWhile((status) => !this.isPollTerminal(status), true),
        catchError(() => {
          this.failSync('Falha ao consultar o status da conexão.');
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (status) => this.handlePollStatus(itemId, status),
        complete: () => this.handlePollComplete(itemId),
      });
  }

  private handlePollStatus(itemId: string, status: PluggyItemStatus): void {
    if (status === 'UPDATED') {
      this.finishSyncSuccess(itemId);
      return;
    }
    if (TERMINAL_ERROR_STATUSES.includes(status)) {
      this.failSync('A conexão precisa de ação sua para atualizar.');
    }
  }

  /** After polling stops without ever hitting UPDATED, treat as timeout. */
  private handlePollComplete(itemId: string): void {
    if (this.syncingItemId() === itemId && this.syncMessage() === 'Sincronizando…') {
      this.failSync('Tempo esgotado ao aguardar a atualização.');
    }
  }

  private finishSyncSuccess(itemId: string): void {
    this.resetSync();
    this.syncMessage.set('Dados atualizados');
    if (this.selectedItemId() === itemId) {
      this.pluggyService.loadTransactions(itemId);
    }
  }

  private isPollTerminal(status: PluggyItemStatus): boolean {
    return status === 'UPDATED' || TERMINAL_ERROR_STATUSES.includes(status);
  }

  private failSync(message: string): void {
    this.resetSync();
    this.syncError.set(message);
  }

  private resetSync(): void {
    this.syncingItemId.set(null);
    this.syncMessage.set(null);
  }

  private runMaterialize(
    itemId: string,
    payload: { transactionIds: readonly string[] } | { all: true },
  ): void {
    this.pluggyService
      .materialize(itemId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.lastResult.set(result);
          this.selectedTxIds.set(new Set());
          // Refresh so alreadyImported flags reflect the new Expenses.
          this.pluggyService.loadTransactions(itemId);
        },
        error: () => undefined,
      });
  }
}
