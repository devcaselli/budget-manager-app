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
import { Share, ShareSourceType } from '@features/share/models/share';
import { ShareService } from '@features/share/services/share.service';
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
 * Task 10 (improvement-shares/frontend-tasks.md): "Type" column of the Obligations panel.
 * The prototype (direction-c.html) uses Type to distinguish Share vs. Manual rows —
 * manual obligations don't exist in this system (confirmed by Victor 2026-07-27), so
 * every row here would be "Share", a useless column. Repurposed for sourceType instead,
 * which is real data already shown on the Shares screen.
 */
const SOURCE_TYPE_LABEL: Record<ShareSourceType, string> = {
  EXPENSE: 'Expense',
  SUBSCRIPTION: 'Subscription',
  INSTALLMENT: 'Installment',
};

/** One row of the Obligations panel — one row per share quota, decomposing an
 *  `activeShareAmount` badge into the individual shares that sum to it. `amount` here
 *  is the periodic/monthly value (`quota.monthlyAmount`), matching the page's monthly
 *  totals — NOT the total/journey `quota.amount` the Shares screen uses. */
export interface ObligationRow {
  readonly shareId: string;
  readonly payerId: string;
  readonly payerName: string;
  readonly sourceLabel: string;
  readonly sourceType: ShareSourceType;
  readonly createdAt: string;
  readonly amount: number;
}

/**
 * Resolves a share's source into a display label. Reuses the two outer tiers of
 * `SharePage.toShareListItem()`'s fallback chain (Task 2): prefer the backend-resolved
 * `sourceName`, else the id's first 8 chars as a last resort. Deliberately does NOT
 * reuse `SharePage`'s middle tier (a local lookup across loaded expenses/installments/
 * subscriptions) — that tier only ever fires when the backend failed to resolve the name
 * AND the client happens to have the source loaded locally, which would require injecting
 * three more services into PayerPage solely to serve a rare fallback-of-a-fallback that
 * this screen has no other use for. `sourceName` already covers the common case; the id
 * slice covers "source deleted / belongs to another owner", the same last resort SharePage
 * itself falls back to.
 */
function sourceLabelOf(share: Pick<Share, 'sourceName' | 'sourceId'>): string {
  return share.sourceName ?? share.sourceId.slice(0, 8);
}

const OBLIGATION_DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
});

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
  private readonly shareService = inject(ShareService);
  private readonly walletService = inject(WalletService);

  protected readonly payers = toSignal(this.payerService.payers$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.payerService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.payerService.saving$, { initialValue: false });
  protected readonly deletingId = toSignal(this.payerService.deleting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.payerService.error$, { initialValue: null });
  protected readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  /**
   * `walletShares$` (GET /wallets/{id}/shares), not the owner-scoped `shares$` — this is
   * the source whose semantics actually match `activeShareAmount` (Task 6): both derive
   * from ACTIVE shares effective for the wallet's current month. `shares$` would also
   * include a *stopped* share (ACTIVE but no longer effective this month — see Task 3's
   * "three states" finding), which `PayerAmountDue.monthly()` — and therefore
   * `activeShareAmount` — excludes. Using `shares$` here would silently make the panel's
   * total diverge from the badge it's supposed to decompose.
   */
  private readonly walletShares = toSignal(this.shareService.walletShares$, { initialValue: [] });

  /** null means "All" selected */
  protected readonly selectedPayerId = signal<string | null>(null);

  protected readonly totalCount = computed(() => this.payers().length);

  /**
   * Bug fix (2026-09-05, Victor's report): this used to sum `this.payers()`
   * unconditionally, ignoring `selectedPayerId`. Every other number on this
   * screen — the list panel (`filteredPayers`), the Obligations panel
   * (`filteredObligationRows`) — already respects the payer filter; the
   * header total didn't, so selecting a single payer left "Total due" (and
   * the hero strip's mirror of it) showing the grand total for every payer
   * while the panels below showed just the one selected — reading as if the
   * header had stopped tracking the list. Summing `filteredPayers()` instead
   * keeps the header in lockstep with what's actually on screen, in both the
   * "All" (id === null) and single-payer states.
   */
  protected readonly totalAmountDue = computed(() =>
    this.filteredPayers().reduce((sum, p) => sum + p.amountDue, 0),
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

  /**
   * Task 10 — Obligations panel: one row per quota of every share in `walletShares$`,
   * decomposing the `activeShareAmount` badge (Task 6) share-by-share. No client-side
   * status/effectiveness filter here — the backend already restricts `walletShares$` to
   * ACTIVE + effective-for-the-wallet's-month (see `ShareService.loadByWalletId`'s doc),
   * which is exactly `activeShareAmount`'s own semantics (`PayerAmountDue.monthly()`).
   * Re-filtering here would risk masking a backend regression instead of surfacing it —
   * same rule Task 1/3 established for `SharePage`'s effective-shares computed.
   *
   * Big-O: O(shares · quotas) to flatten, which is the same order as the data itself —
   * no avoidable nested lookups. Memoized by `computed`, recomputes only when
   * `walletShares()` changes.
   *
   * `amount` is sourced from `quota.monthlyAmount`, not `quota.amount` — this panel
   * must show the periodic/monthly value to match the page's own totals
   * (`totalAmountDue`, `activeShareAmount`), the same monthly semantics `shareBadge()`
   * already relies on. `quota.amount` is the total/journey figure (full installment
   * plan, etc.) and belongs to the Shares screen (`SharePage`), not here — using it
   * here was the bug Victor found manually testing: this panel showed the raw/total
   * Share amount instead of the monthly one shown at the top of the screen.
   */
  protected readonly obligationRows = computed<readonly ObligationRow[]>(() => {
    const rows: ObligationRow[] = [];
    for (const share of this.walletShares()) {
      const label = sourceLabelOf(share);
      for (const quota of share.quotas) {
        rows.push({
          shareId: share.id,
          payerId: quota.payerId,
          payerName: quota.payerName,
          sourceLabel: label,
          sourceType: share.sourceType,
          createdAt: share.createdAt,
          amount: Number(quota.monthlyAmount),
        });
      }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  /**
   * Filtered by the same `selectedPayerId` the payer selector strip uses (no parallel
   * selection state, per the task spec).
   *
   * Transient-quota rows: a quota's `payerId` doesn't always correspond to a real `Payer`
   * in `payers()` (transient payers created inline on a share — see `ShareQuotaMode`).
   * Decision: these rows still show under "All" (id === null), using the `payerName` the
   * backend already resolved for the quota — they're real obligations, just not tied to a
   * standing/transient `Payer` record. They naturally disappear when a specific payer is
   * selected (their `payerId` won't match), which is correct: they aren't that payer's row.
   */
  protected readonly filteredObligationRows = computed<readonly ObligationRow[]>(() => {
    const id = this.selectedPayerId();
    return id === null
      ? this.obligationRows()
      : this.obligationRows().filter((row) => row.payerId === id);
  });

  protected readonly obligationSourceTypeLabel = SOURCE_TYPE_LABEL;

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.selectedPayerId.set(null);
      this.payerService.loadByWalletId(walletId);
      this.shareService.loadByWalletId(walletId);
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

  /** `Share.createdAt` is a full ISO datetime (unlike `Payer.paymentDate`, a date-only
   *  string) — needs its own formatter rather than `formatDate`'s `T00:00:00Z` shim. */
  protected formatObligationDate(iso: string): string {
    return OBLIGATION_DATE_FORMAT.format(new Date(iso));
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
