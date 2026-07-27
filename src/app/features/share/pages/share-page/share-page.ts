import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { catchError, of } from 'rxjs';

import { ExpenseService } from '@features/expense/services/expense.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { Payer } from '@features/payer/models/payer';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { Share, ShareSourceType } from '../../models/share';
import { ShareService } from '../../services/share.service';
import { ShareFormDialogComponent } from '../../components/share-form-dialog/share-form-dialog.component';

interface ShareListItem {
  readonly id: string;
  readonly sourceLabel: string;
  readonly sourceType: ShareSourceType;
  readonly totalAmount: number;
  readonly ownerShare: number;
  readonly ownerRatioLabel: string;
  readonly currency: string;
  readonly status: string;
  readonly active: boolean;
  /** ACTIVE with a stoppedFromMonth in effect — still valid for past months, just no
   *  longer applying going forward. Distinct from `active` (which stays true for a
   *  stopped share — see Share.java:291-294, revert() only rejects REVERTED) and from
   *  `status`/`Reverted` (stopping is non-destructive, unlike revert). */
  readonly stopped: boolean;
  readonly quotasLabel: string;
  readonly paymentsCount: number;
  readonly createdAt: string;
  readonly revertedAt: string | null;
  readonly stoppedFromMonth: string | null;
}

const SOURCE_LABEL: Record<ShareSourceType, string> = {
  EXPENSE: 'Expense',
  SUBSCRIPTION: 'Subscription',
  INSTALLMENT: 'Installment',
};

@Component({
  selector: 'app-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe],
  templateUrl: './share-page.html',
  styleUrl: './share-page.scss',
})
export class SharePage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly expenseService = inject(ExpenseService);
  private readonly installmentService = inject(InstallmentService);
  private readonly shareService = inject(ShareService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly walletService = inject(WalletService);

  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly installments = toSignal(this.installmentService.allInstallments$, { initialValue: [] });
  private readonly shares = toSignal(this.shareService.shares$, { initialValue: [] });
  private readonly walletShares = toSignal(this.shareService.walletShares$, { initialValue: [] });
  private readonly subscriptions = toSignal(this.subscriptionService.subscriptions$, {
    initialValue: [],
  });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly walletPayers = signal<readonly Payer[]>([]);
  protected readonly wallet = this.selectedWallet;

  /** Which tab of the share ledger is visible. Default 'active' per the plan (Task 3). */
  protected readonly shareView = signal<'active' | 'history'>('active');

  protected readonly isLoading = toSignal(this.shareService.loading$, { initialValue: false });
  protected readonly revertingId = toSignal(this.shareService.reverting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.shareService.error$, { initialValue: null });

  /**
   * Effective shares for the selected wallet — the authoritative source for the Active
   * tab. Backed by `walletShares$` (GET /wallets/{id}/shares), which the backend already
   * filters to ACTIVE + effective-for-the-wallet's-month across all 3 source types
   * (fixed in backend commit 644cfca — see Task 1's doc on `ShareService`). Deliberately
   * NOT re-filtered by status here: doing so would mask a backend regression instead of
   * surfacing it (e.g. if the endpoint started returning REVERTED shares again, this
   * computed would silently show them as "effective" rather than failing loudly).
   */
  private readonly effectiveShareItems = computed<readonly ShareListItem[]>(() =>
    this.walletShares().map((share) => this.toShareListItem(share)),
  );

  /**
   * Stopped shares for the selected wallet — a share is ACTIVE with `stoppedFromMonth`
   * set, non-effective for the wallet's current month, but still valid for past months
   * (Share.stopFrom() is non-destructive, unlike revert — Share.java, achado nº 1b of the
   * plan). These are omitted by `walletShares$` by construction (that's what
   * `isEffectiveFor` filters out), so they only exist in the owner-scoped `shares$`.
   *
   * This is NOT re-filtering the wallet-scoped result — it's a set the backend
   * deliberately omits, disjoint from `effectiveShareItems` in the common case. It only
   * overlaps for a `stoppedFromMonth` in the FUTURE: such a share is still effective (so
   * it's also returned by `walletShares$`) while also matching this client-side
   * `stoppedFromMonth !== null` check — replicating the exact `walletMonth >=
   * stoppedFromMonth` comparison here isn't worth it just to avoid an overlap that the
   * union step below already dedupes by id.
   */
  private readonly stoppedShareItems = computed<readonly ShareListItem[]>(() => {
    const walletId = this.selectedWallet()?.id;
    if (!walletId) {
      return [];
    }

    return this.shares()
      .filter((share) => share.walletId === walletId && share.status === 'ACTIVE' && share.stoppedFromMonth !== null)
      .map((share) => this.toShareListItem(share));
  });

  /**
   * The Active tab's contents: effective shares ∪ stopped shares, deduped by `id` (the
   * wallet-scoped item wins on overlap — see `stoppedShareItems`' doc for why an overlap
   * can happen at all), sorted newest-first (same ordering the old single-source
   * `shareItems()` used).
   */
  protected readonly activeShareItems = computed<readonly ShareListItem[]>(() => {
    const byId = new Map<string, ShareListItem>();
    for (const item of this.stoppedShareItems()) {
      byId.set(item.id, item);
    }
    for (const item of this.effectiveShareItems()) {
      byId.set(item.id, item); // wallet-scoped wins on overlap (future stoppedFromMonth case)
    }

    return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  /**
   * The History tab's contents — REVERTED shares for the selected wallet. `shares$` is
   * owner-scoped and unfiltered (every wallet, every status), so the walletId scoping
   * here is mandatory, not optional — without it, another wallet's reverted shares leak
   * into this list.
   */
  protected readonly revertedShareItems = computed<readonly ShareListItem[]>(() => {
    const walletId = this.selectedWallet()?.id;
    if (!walletId) {
      return [];
    }

    return this.shares()
      .filter((share) => share.walletId === walletId && share.status === 'REVERTED')
      .map((share) => this.toShareListItem(share))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  protected readonly visibleShareItems = computed<readonly ShareListItem[]>(() =>
    this.shareView() === 'active' ? this.activeShareItems() : this.revertedShareItems(),
  );

  // Active count includes stopped shares — consistent with what the Active tab shows.
  protected readonly activeShareCount = computed(() => this.activeShareItems().length);
  protected readonly revertedShareCount = computed(() => this.revertedShareItems().length);

  /**
   * Pre-existing bug fix: this used to sum ACTIVE + REVERTED together (the old single
   * `shareItems()`), which is wrong — a reverted share no longer affects the ledger by
   * definition. Now sums only `activeShareItems()` (effective + stopped; stopped shares
   * still count because "assigned" isn't scoped to "this month", and this is the closest
   * behavior to what the label already implied — not chasing more precision than that
   * without Victor asking). This changes a visible number on the page; expected, not a
   * regression — flagged for Victor's manual test pass.
   */
  protected readonly sharedTotal = computed(() =>
    this.activeShareItems().reduce((sum, share) => sum + share.totalAmount, 0),
  );

  constructor() {
    // Owner-scoped, not wallet-scoped — load once, not on every wallet switch (self-review
    // finding: an earlier version of this moved the call inside the wallet-change effect
    // below, which re-fetched all subscriptions redundantly on every wallet switch). This
    // page only reads subscriptions() as describeSource()'s SUBSCRIPTION fallback — the
    // list itself doesn't depend on which wallet is selected.
    this.subscriptionService.loadSubscriptions();

    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.expenseService.loadByWalletId(walletId);
      this.installmentService.loadByWalletId(walletId);
      // Both share sources feed the Active tab (effective + stopped) — load both on
      // every wallet change, not just one per tab.
      this.shareService.loadAll();
      this.shareService.loadByWalletId(walletId);

      if (!walletId) {
        this.walletPayers.set([]);
        return;
      }

      this.walletService
        .findPayersByWalletId(walletId)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of([])),
        )
        .subscribe((payers) => this.walletPayers.set(payers));
    });
  }

  /**
   * Opens the create-share form in a modal (Task 4 — the form used to be embedded
   * directly in this page). On success (`ShareFormDialogComponent` closes with the
   * created `Share`), reload `walletShares$` for the selected wallet: the new share
   * needs to appear in the Active tab, which is composed from `walletShares$` +
   * `shares$` (Task 3) — `ShareService.create()`'s own upsert only touches `shares$`,
   * which doesn't cover the "effective" slice of Active. Reloading (rather than
   * upserting into `walletShares$` too) is deliberate: whether the new share is
   * "effective for this wallet's month" is a call only the backend can make correctly
   * (`Share.isEffectiveFor`), so re-fetching is the source of truth instead of a
   * client-side guess that could drift from it.
   */
  protected openCreateShareDialog(): void {
    this.dialog
      .open(ShareFormDialogComponent, {
        width: '44rem',
        maxWidth: 'calc(100vw - 2rem)',
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((created) => {
        if (created) {
          this.shareService.loadByWalletId(this.selectedWallet()?.id ?? null);
        }
      });
  }

  /**
   * `ShareService.revert()` reloads `shares$` on its own (see its JSDoc — the service has
   * no notion of "selected wallet" so it can't reload `walletShares$` itself). This is the
   * caller it documented as responsible for that: reverting a share must move it out of
   * the Active tab, which is composed from `walletShares$` too — without this reload the
   * Active tab would keep showing the just-reverted share until the next wallet switch.
   *
   * `walletId` is read inside the `next` callback, not captured before the async
   * `revert()` call — reading it upfront would close over a stale value if the user
   * switches wallets while the revert is in flight, reloading the wrong (now-deselected)
   * wallet's shares right after the wallet-change effect already loaded the new one.
   */
  protected revertShare(id: string): void {
    this.shareService
      .revert(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.shareService.loadByWalletId(this.selectedWallet()?.id ?? null),
        error: () => undefined,
      });
  }

  protected payerName(payerId: string): string {
    return this.walletPayers().find((payer) => payer.id === payerId)?.name ?? payerId.slice(0, 8);
  }

  private toShareListItem(share: Share): ShareListItem {
    return {
      id: share.id,
      sourceLabel: share.sourceName ?? this.describeSource(share.sourceType, share.sourceId),
      sourceType: share.sourceType,
      totalAmount: Number(share.totalAmount),
      ownerShare: Number(share.ownerShare),
      ownerRatioLabel: `${Math.round(Number(share.ownerRatio) * 100)}% owner`,
      currency: share.currency,
      status: share.status === 'ACTIVE' ? 'Active' : 'Reverted',
      active: share.status === 'ACTIVE',
      stopped: share.status === 'ACTIVE' && share.stoppedFromMonth !== null,
      quotasLabel: share.quotas
        .map((quota) => `${quota.payerName || this.payerName(quota.payerId)} · ${this.fmt(Number(quota.amount), share.currency)}`)
        .join(' / '),
      paymentsCount: share.paymentIds.length,
      createdAt: this.fmtDateTime(share.createdAt),
      revertedAt: share.revertedAt ? this.fmtDateTime(share.revertedAt) : null,
      stoppedFromMonth: share.stoppedFromMonth,
    };
  }

  /**
   * Fallback only — the common path is `share.sourceName` (resolved server-side), which
   * makes this a rare-case lookup, not the primary one. Covers a window where the backend
   * couldn't resolve the name but the client already has the source loaded locally; the
   * final fallback (`sourceId.slice(0, 8)`) covers the case where neither has it (source
   * deleted, or belongs to another owner/wallet/month).
   *
   * Deliberately still a linear `.find()` per call — O(n·m) if this ran for every share in
   * a `.map()`, but with `sourceName` covering the common case it now only runs for the
   * rare fallback. Do not pre-build a `Map` index here "to optimize": that would cost O(n)
   * unconditionally to speed up a path that, by construction, almost never executes.
   */
  private describeSource(sourceType: ShareSourceType, sourceId: string): string {
    if (sourceType === 'EXPENSE') {
      return this.expenses().find((expense) => expense.id === sourceId)?.name ?? sourceId.slice(0, 8);
    }

    if (sourceType === 'INSTALLMENT') {
      return this.installments().find((installment) => installment.id === sourceId)?.description
        ?? sourceId.slice(0, 8);
    }

    return this.subscriptions().find((subscription) => subscription.id === sourceId)?.description
      ?? sourceId.slice(0, 8);
  }

  private fmt(value: number, currency = 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }

  private fmtDateTime(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  protected readonly sourceLabel = SOURCE_LABEL;
}
