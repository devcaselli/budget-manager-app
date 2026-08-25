import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, map, of } from 'rxjs';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { BrDatePipe } from '@shared/pipes/br-date.pipe';
import { formatBrl } from '@shared/utils/currency';
import { TagChip, toTagChips } from '@shared/utils/tag-chips';
import {
  ExpensePaymentStatus,
  ExpenseSortOrder,
  filterAndSortExpenses,
} from '@features/expense/expense-list.filters';
import { Bullet } from '@features/bullet/models/bullet';
import { BulletService } from '@features/bullet/services/bullet.service';
import { Payment } from '@features/payment/models/payment';
import { PaymentService } from '@features/payment/services/payment.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { Payer } from '@features/payer/models/payer';
import { Share } from '@features/share/models/share';
import { ShareService } from '@features/share/services/share.service';
import { TagService } from '@features/tag/services/tag.service';
import { SyncService } from '@features/sync/services/sync.service';
import { PendingReviewService } from '@features/pending-review/services/pending-review.service';
import { PendingReviewDialogComponent } from '@features/pending-review/components/pending-review-dialog/pending-review-dialog.component';
import {
  TagPickerDialogComponent,
  TagPickerDialogData,
  TagPickerDialogResult,
} from '@shared/components/tag-picker-dialog/tag-picker-dialog.component';
import { OmegaViewerLauncher } from '@shared/components/omega-viewer/omega-viewer-launcher';

import {
  ExpenseDeleteDialogComponent,
  ExpenseDeleteDialogData,
} from '../../components/expense-delete-dialog/expense-delete-dialog.component';
import {
  ExpensePaymentDialogComponent,
  ExpensePaymentDialogResult,
} from '../../components/expense-payment-dialog/expense-payment-dialog.component';
import {
  InteractiveShareDialogComponent,
  InteractiveShareDialogData,
  InteractiveShareDialogResult,
} from '../../components/interactive-share-dialog/interactive-share-dialog.component';
import { ExpenseService } from '../../services/expense.service';

interface ExpenseListItem {
  readonly id: string;
  readonly name: string;
  readonly purchaseDate: string;
  readonly creditCardId: string | null;
  readonly creditCardLabel: string;
  readonly remainingValue: number;
  readonly cost: number;
  readonly remaining: number;
  readonly paid: number;
  readonly progress: number;
  readonly statusLabel: string;
  readonly bulletLabel: string;
  readonly activeShares: readonly Share[];
  readonly hasShare: boolean;
  readonly shareSummary: string;
  readonly tagIds: readonly string[];
  readonly tagChips: readonly TagChip[];
  readonly tagNames: readonly string[];
}

interface BulletOption {
  readonly id: string;
  readonly description: string;
  readonly remaining: string;
}

/** Desktop-only ledger layout toggle (D6). Mobile-forced grouped layout is D8, out of scope. */
type LedgerLayout = 'ledger' | 'grouped';

interface ExpenseDayGroup {
  readonly date: string;
  readonly items: readonly ExpenseListItem[];
  readonly subtotal: number;
}

interface FilterChip {
  readonly id: string;
  readonly label: string;
  readonly clear: () => void;
}

@Component({
  selector: 'app-expense-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrDatePipe, BrlCurrencyPipe, MatIconModule, ReactiveFormsModule],
  templateUrl: './expense-page.html',
  styleUrl: './expense-page.scss',
})
export class ExpensePage implements AfterViewChecked {
  private readonly destroyRef = inject(DestroyRef);
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly bulletService = inject(BulletService);
  private readonly expenseService = inject(ExpenseService);
  private readonly paymentService = inject(PaymentService);
  private readonly walletService = inject(WalletService);
  private readonly installmentService = inject(InstallmentService);
  private readonly shareService = inject(ShareService);
  private readonly tagService = inject(TagService);
  private readonly syncService = inject(SyncService);
  private readonly pendingReviewService = inject(PendingReviewService);
  private readonly omegaViewerLauncher = inject(OmegaViewerLauncher);

  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly expenses = toSignal(this.expenseService.expenses$, { initialValue: [] });
  private readonly payments = toSignal(this.paymentService.payments$, { initialValue: [] });
  private readonly shares = toSignal(this.shareService.shares$, { initialValue: [] });
  private readonly tags = toSignal(this.tagService.tags$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly walletPayers = signal<readonly Payer[]>([]);

  protected readonly creditCards = toSignal(this.installmentService.creditCards$, {
    initialValue: [],
  });

  protected readonly wallet = this.selectedWallet;
  protected readonly isLoading = toSignal(this.expenseService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.expenseService.saving$, { initialValue: false });
  protected readonly isPaying = toSignal(this.paymentService.paying$, { initialValue: false });
  protected readonly deletingExpenseId = toSignal(this.expenseService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.expenseService.error$, { initialValue: null });
  protected readonly paymentErrorMessage = toSignal(this.paymentService.error$, {
    initialValue: null,
  });
  protected readonly isSyncing = toSignal(this.syncService.syncing$, { initialValue: false });
  protected readonly syncErrorMessage = toSignal(this.syncService.error$, { initialValue: null });
  protected readonly syncResultMessage = signal<string | null>(null);
  protected readonly hasCreditCards = computed(() => this.creditCards().length > 0);
  protected readonly createExpenseBlockerMessage = computed(() => {
    if (!this.wallet()) {
      return 'Selecione uma wallet para cadastrar uma expense.';
    }

    if (!this.hasCreditCards()) {
      return 'Você precisa ter um cartão de crédito cadastrado para cadastrar expenses.';
    }

    return null;
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    cost: [0, [Validators.required, Validators.min(0.01)]],
    purchaseDate: [this.today(), Validators.required],
    creditCardId: ['', Validators.required],
    isInstallment: [false],
    installmentCharges: [0],
  });

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
    search: [''],
    creditCardId: [''],
    sortOrder: ['DATE_DESC' as ExpenseSortOrder],
    paymentStatus: ['ALL' as ExpensePaymentStatus],
    startDate: [''],
    endDate: [''],
    // Server-side filter (Task 7's `unhidden` param on GET /expenses/wallet/{id}), not a
    // client-side criterion. ExpenseResponseDto has no `hidden` field, so there is no way
    // to filter this client-side — expense-list.filters.ts is deliberately left untouched.
    unhidden: [false],
  });

  protected readonly showInstallments = toSignal(
    this.form.controls.isInstallment.valueChanges,
    { initialValue: false },
  );
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  private readonly filtersValue = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.getRawValue(),
  });
  private readonly unhiddenFilter = toSignal(this.filtersForm.controls.unhidden.valueChanges, {
    initialValue: false,
  });
  protected readonly canSubmitExpense = computed(() =>
    !!this.wallet() && this.hasCreditCards() && this.formStatus() === 'VALID' && !this.isSaving(),
  );

  // Memoized on its own — depends only on tags(), so it's not rebuilt when expenseItems
  // recomputes for unrelated reasons (payments, shares, bullets changing).
  private readonly tagMap = computed<ReadonlyMap<string, string>>(
    () => new Map(this.tags().map((tag) => [tag.id, tag.name])),
  );

  // Same pre-built-Map pattern as tagMap, applied to payments/bullets/shares below: a
  // wallet can now carry its full dataset (fetchAllPages walks every page, no longer
  // just the first 100), so the O(n·m) .find()/.filter() scans that used to run
  // per-expense would scale with dataset size squared. One Map per source, one pass
  // over each source, then O(1) lookups inside the expenses .map() further down.
  //
  // Built with an explicit "first payment for this expenseId wins" rule, matching the
  // .find() semantics it replaces — a plain `new Map(...)` would instead let the *last*
  // matching entry silently overwrite earlier ones.
  private readonly paymentByExpenseId = computed<ReadonlyMap<string, Payment>>(() => {
    const map = new Map<string, Payment>();
    for (const payment of this.payments()) {
      if (payment.expenseId && !map.has(payment.expenseId)) {
        map.set(payment.expenseId, payment);
      }
    }
    return map;
  });

  private readonly bulletById = computed<ReadonlyMap<string, Bullet>>(
    () => new Map(this.bullets().map((bullet) => [bullet.id, bullet])),
  );

  // Hoisted out of expenseItems so filterChips (the active-card chip label) can reuse the
  // same O(1) lookup instead of a fresh .find() over creditCards() on every recompute.
  private readonly creditCardNameById = computed<ReadonlyMap<string, string>>(
    () => new Map(this.creditCards().map((card) => [card.id, card.name])),
  );

  private readonly activeExpenseSharesBySourceId = computed<ReadonlyMap<string, Share[]>>(() => {
    const map = new Map<string, Share[]>();
    for (const share of this.shares()) {
      if (share.sourceType !== 'EXPENSE' || share.status !== 'ACTIVE') continue;
      const existing = map.get(share.sourceId);
      if (existing) {
        existing.push(share);
      } else {
        map.set(share.sourceId, [share]);
      }
    }
    return map;
  });

  protected readonly expenseItems = computed<readonly ExpenseListItem[]>(() => {
    const creditCardNameById = this.creditCardNameById();
    const tagMap = this.tagMap();
    const paymentByExpenseId = this.paymentByExpenseId();
    const bulletById = this.bulletById();
    const activeSharesBySourceId = this.activeExpenseSharesBySourceId();
    return this.expenses().map((expense) => {
      const payment = paymentByExpenseId.get(expense.id);
      const bullet = payment?.bulletId ? bulletById.get(payment.bulletId) : null;
      const cost = Number(expense.cost);
      const remaining = Number(expense.remaining);
      const paid = Math.max(cost - remaining, 0);
      const progress = cost > 0 ? Math.min((paid / cost) * 100, 100) : 0;
      const creditCardId = expense.creditCardId ?? null;
      const activeShares = activeSharesBySourceId.get(expense.id) ?? [];
      const shareSummary = activeShares
        .flatMap((share) => share.quotas)
        .map((quota) => `${quota.payerName}: ${formatBrl(Number(quota.amount))}`)
        .join(' · ');
      const tagIds = expense.tagIds ?? [];
      const tagChips = toTagChips(tagIds, tagMap);
      return {
        id: expense.id,
        name: expense.name,
        purchaseDate: expense.purchaseDate,
        creditCardId,
        creditCardLabel: creditCardId ? (creditCardNameById.get(creditCardId) ?? creditCardId) : '—',
        remainingValue: remaining,
        cost,
        remaining,
        paid,
        progress,
        statusLabel: remaining <= 0 ? 'PAID' : 'OPEN',
        bulletLabel: bullet?.description ?? '—',
        activeShares,
        hasShare: activeShares.length > 0,
        shareSummary,
        tagIds,
        tagChips,
        tagNames: tagChips.map((chip) => chip.name),
      };
    });
  });

  protected readonly filteredExpenseItems = computed<readonly ExpenseListItem[]>(() =>
    filterAndSortExpenses(this.expenseItems(), this.filtersValue()),
  );

  protected readonly bulletOptions = computed<readonly BulletOption[]>(() =>
    this.bullets()
      .filter((b) => Number(b.remaining) > 0)
      .map((b) => ({
        id: b.id,
        description: b.description,
        remaining: formatBrl(Number(b.remaining)),
      })),
  );

  protected readonly totalCost = computed(() =>
    this.expenses().reduce((acc, e) => acc + Number(e.cost), 0),
  );

  protected readonly totalOpen = computed(() =>
    this.expenses().reduce((acc, e) => acc + Number(e.remaining), 0),
  );

  // ── D6: stat cards, toolbar, ledger/grouped layout ──────────────────────

  protected readonly totalPaid = computed(() => Math.max(this.totalCost() - this.totalOpen(), 0));

  protected readonly openCount = computed(
    () => this.expenseItems().filter((item) => item.statusLabel === 'OPEN').length,
  );

  /** CSS custom-property percentage for the paid-vs-open bar — a bar-width % is the one
   *  derived value the "no [style] concatenation" rule allows, bound via [style.--bar-width.%]
   *  rather than a full inline style object. */
  protected readonly paidPercent = computed(() => {
    const total = this.totalCost();
    return total > 0 ? Math.min(Math.round((this.totalPaid() / total) * 100), 100) : 0;
  });

  /** Reuses the same `pendingReviews$` list the Shell's Inbox badge and the dedicated
   *  `/review-imports` page already read from — no new data source. */
  protected readonly pendingReviewCount = toSignal(
    this.pendingReviewService.pendingReviews$.pipe(map((items) => items.length)),
    { initialValue: 0 },
  );
  protected readonly hasPendingImports = computed(() => this.pendingReviewCount() > 0);
  protected readonly importBannerDismissed = signal(false);
  protected readonly showImportBanner = computed(
    () => this.hasPendingImports() && !this.importBannerDismissed(),
  );

  protected readonly layout = signal<LedgerLayout>('ledger');
  protected readonly isGroupedLayout = computed(() => this.layout() === 'grouped');

  /** Exposes the current sortOrder to the template — grouped layout always orders groups
   *  by date (VALUE_ASC/VALUE_DESC only applies within a day), so the sort <select> disables
   *  the value options and this drives the explanatory hint when one was already selected. */
  protected readonly filtersValueSortOrder = computed(() => this.filtersValue().sortOrder);

  private static readonly STATUS_TABS: readonly ExpensePaymentStatus[] = ['ALL', 'OPEN', 'PAID'];
  protected readonly statusTabIndex = computed(() =>
    Math.max(ExpensePage.STATUS_TABS.indexOf(this.filtersValue().paymentStatus ?? 'ALL'), 0),
  );

  /** Buckets filtered items by purchaseDate in one O(n) pass, then sorts the resulting
   *  group keys O(g log g) — never .find()/.filter() per item, per the epic's ban on
   *  reintroducing O(n·m) lookups (same pattern as the card/bullet/payment/share Maps
   *  above). Subtotal is accumulated during the same bucketing pass, not a second scan. */
  protected readonly dayGroups = computed<readonly ExpenseDayGroup[]>(() => {
    const byDate = new Map<string, ExpenseListItem[]>();
    for (const item of this.filteredExpenseItems()) {
      const bucket = byDate.get(item.purchaseDate);
      if (bucket) {
        bucket.push(item);
      } else {
        byDate.set(item.purchaseDate, [item]);
      }
    }

    const sortOrder = this.filtersValue().sortOrder ?? 'DATE_DESC';
    const dates = [...byDate.keys()].sort((a, b) =>
      sortOrder === 'DATE_ASC' ? a.localeCompare(b) : b.localeCompare(a),
    );

    return dates.map((date) => {
      const items = byDate.get(date) ?? [];
      const subtotal = items.reduce(
        (acc, item) => acc + (item.statusLabel === 'OPEN' ? item.remaining : item.cost),
        0,
      );
      return { date, items, subtotal };
    });
  });

  protected readonly filterChips = computed<readonly FilterChip[]>(() => {
    const value = this.filtersValue();
    const chips: FilterChip[] = [];

    if (value.creditCardId) {
      const cardName = this.creditCardNameById().get(value.creditCardId);
      chips.push({
        id: 'card',
        label: `Card · ${cardName ?? value.creditCardId}`,
        clear: () => this.filtersForm.controls.creditCardId.setValue(''),
      });
    }
    if (value.sortOrder && value.sortOrder !== 'DATE_DESC') {
      chips.push({
        id: 'sort',
        label: `Sort · ${value.sortOrder.toLowerCase().replace('_', ' ')}`,
        clear: () => this.filtersForm.controls.sortOrder.setValue('DATE_DESC'),
      });
    }
    if (value.paymentStatus && value.paymentStatus !== 'ALL') {
      chips.push({
        id: 'status',
        label: `Status · ${value.paymentStatus.toLowerCase()}`,
        clear: () => this.filtersForm.controls.paymentStatus.setValue('ALL'),
      });
    }
    if (value.startDate) {
      chips.push({
        id: 'startDate',
        label: `From · ${value.startDate}`,
        clear: () => this.filtersForm.controls.startDate.setValue(''),
      });
    }
    if (value.endDate) {
      chips.push({
        id: 'endDate',
        label: `To · ${value.endDate}`,
        clear: () => this.filtersForm.controls.endDate.setValue(''),
      });
    }
    if (value.unhidden) {
      chips.push({
        id: 'unhidden',
        label: 'Hidden items shown',
        clear: () => this.filtersForm.controls.unhidden.setValue(false),
      });
    }
    if (value.search?.trim()) {
      chips.push({
        id: 'search',
        label: `Search · ${value.search.trim()}`,
        clear: () => this.filtersForm.controls.search.setValue(''),
      });
    }

    return chips;
  });

  // ── Focus management on chip removal (a11y) ─────────────────────────────
  // Removing a chip re-renders the chips row; without an explicit focus target the
  // browser drops focus to <body>, silently stranding keyboard/screen-reader users.
  // chipButtons()/searchInput() are read imperatively inside chipRemoved(), never as a
  // reactive computed() dependency — they're DOM refs, not state to derive from.
  private readonly chipButtons = viewChildren<ElementRef<HTMLButtonElement>>('chipButton');
  private readonly clearAllButton = viewChild<ElementRef<HTMLButtonElement>>('clearAllButton');
  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private pendingChipFocus = false;

  protected chipRemoved(label: string): void {
    this.pendingChipFocus = true;
    this.liveAnnouncer.announce(`Removed filter ${label}`, 'polite');
  }

  /** Runs after the chip row's DOM has settled following a removal (see chipRemoved()):
   *  focuses the next remaining chip, else "Clear all", else the search input once the row
   *  is empty. AfterViewChecked (not a computed/effect) because this is an imperative DOM
   *  side effect keyed to a one-shot flag, not a value to keep in sync every CD cycle. */
  ngAfterViewChecked(): void {
    if (!this.pendingChipFocus) return;
    this.pendingChipFocus = false;

    const nextChip = this.chipButtons()[0]?.nativeElement;
    if (nextChip) {
      nextChip.focus();
      return;
    }
    const clearAll = this.clearAllButton()?.nativeElement;
    if (clearAll) {
      clearAll.focus();
      return;
    }
    this.searchInputRef()?.nativeElement.focus();
  }

  constructor() {
    // Wallet switch: reloads everything scoped to the wallet and resets the create-expense
    // form. Reads `unhiddenFilter()` with `untracked()` — it needs the *current* value of the
    // checkbox so switching wallets doesn't silently reset the filter, but must NOT become a
    // reactive dependency, otherwise toggling the checkbox would re-fire all 5 loads and
    // resetForm() below (split into its own effect specifically to avoid that).
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      const unhidden = untracked(this.unhiddenFilter);
      this.bulletService.loadByWalletId(walletId);
      this.expenseService.loadByWalletId(walletId, unhidden);
      this.paymentService.loadByWalletId(walletId);
      // Load credit cards for the dropdown
      this.installmentService.loadByWalletId(walletId);
      this.shareService.loadAll();
      this.resetForm();
    });

    // `unhidden` checkbox toggle: re-fetch expenses only, for the current wallet. Deliberately
    // separate from the wallet effect above so toggling the checkbox never re-triggers the
    // other 5 wallet-scoped loads or resets the create-expense form.
    // Skips its own first run: the wallet effect above already issues the initial
    // loadByWalletId call (reading the same initial `unhidden` value via untracked()), so
    // without this guard the two effects would double-fire an identical request on construction.
    let isFirstUnhiddenRun = true;
    effect(() => {
      const unhidden = this.unhiddenFilter();
      if (isFirstUnhiddenRun) {
        isFirstUnhiddenRun = false;
        return;
      }
      const walletId = untracked(this.selectedWallet)?.id ?? null;
      this.expenseService.loadByWalletId(walletId, unhidden);
    });

    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.reloadWalletPayers(walletId);
    });

    this.tagService.loadAll();
  }

  private reloadWalletPayers(walletId: string | null): void {
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
  }

  protected setLayout(layout: LedgerLayout): void {
    this.layout.set(layout);
  }

  protected setStatusTab(status: ExpensePaymentStatus): void {
    this.filtersForm.controls.paymentStatus.setValue(status);
  }

  protected dismissImportBanner(): void {
    this.importBannerDismissed.set(true);
  }

  protected clearAllFilters(): void {
    this.filtersForm.patchValue({
      creditCardId: '',
      sortOrder: 'DATE_DESC',
      paymentStatus: 'ALL',
      startDate: '',
      endDate: '',
      unhidden: false,
      search: '',
    });
  }

  protected toggleInstallment(): void {
    const current = this.form.controls.isInstallment.value;
    this.form.controls.isInstallment.setValue(!current);

    if (!current) {
      // turning on: require installmentCharges >= 2
      this.form.controls.installmentCharges.setValidators([Validators.required, Validators.min(2)]);
    } else {
      // turning off: clear validators
      this.form.controls.installmentCharges.clearValidators();
      this.form.controls.installmentCharges.setValue(0);
    }
    this.form.controls.installmentCharges.updateValueAndValidity();
  }

  protected createExpense(): void {
    const wallet = this.selectedWallet();
    if (!wallet || !this.hasCreditCards() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const isInstallment = value.isInstallment;
    const charges = value.installmentCharges;

    this.expenseService
      .create({
        name: value.name.trim(),
        cost: value.cost,
        purchaseDate: value.purchaseDate,
        walletId: wallet.id,
        creditCardId: value.creditCardId,
        ...(isInstallment && charges >= 2
          ? { installment: true, installmentNumber: charges }
          : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.resetForm(), error: () => undefined });
  }

  protected openPaymentDialog(expense: ExpenseListItem): void {
    const wallet = this.selectedWallet();
    if (!wallet || expense.remainingValue <= 0 || this.bulletOptions().length === 0) return;

    this.dialog
      .open<
        ExpensePaymentDialogComponent,
        { expense: ExpenseListItem; bullets: readonly BulletOption[] },
        ExpensePaymentDialogResult
      >(ExpensePaymentDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: { expense, bullets: this.bulletOptions() },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.payExpense(wallet.id, expense.id, result);
      });
  }

  protected openShareDialog(expense: ExpenseListItem): void {
    const wallet = this.selectedWallet();
    // Backend allows only one active share per source — the row button is hidden once
    // expense.hasShare is true, but guard here too in case of a stale click.
    if (!wallet || expense.hasShare) return;

    this.dialog
      .open<InteractiveShareDialogComponent, InteractiveShareDialogData, InteractiveShareDialogResult>(
        InteractiveShareDialogComponent,
        {
          width: '32rem',
          maxWidth: 'calc(100vw - 2rem)',
          data: {
            walletId: wallet.id,
            expense: { id: expense.id, name: expense.name, cost: expense.cost, currency: 'BRL' },
            payers: this.walletPayers(),
          },
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          // Refresh authoritative state after a share is created. The share creates a
          // payment for the owner's portion server-side, reducing the expense's
          // `remaining`, so expense/payment must reload (same as payExpense). shareService
          // reloads via the owner-scoped GET /shares so the new share's `hasShare` badge
          // and the hidden split button are correct. A transient/new payer may also now
          // exist, so refresh payers too.
          const id = wallet.id;
          this.expenseService.loadByWalletId(id);
          this.paymentService.loadByWalletId(id);
          this.shareService.loadAll();
          this.reloadWalletPayers(id);
        }
      });
  }

  protected syncNow(): void {
    if (this.isSyncing()) return;

    this.syncResultMessage.set(null);
    this.syncService
      .ingest()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const { report } = result;
          // `report.fallback` is always 0 in the staging-only flow (card resolution moved
          // to confirm time — backend commit 38cab7e) and `created` now means "staged for
          // review", not "Expense created" (that happens on confirm inside the dialog that
          // opens next) — omitted/reworded here so the summary doesn't imply either.
          this.syncResultMessage.set(
            `${report.created} staged for review, ${report.skipped} skipped, ${report.errors} errors`,
          );
          this.pendingReviewService.applySyncResult(result);
          this.openPendingReviewDialog();
        },
        error: () => undefined,
      });
  }

  protected openPendingReviewDialog(): void {
    this.dialog
      .open(PendingReviewDialogComponent, {
        width: '60rem',
        maxWidth: 'calc(100vw - 2rem)',
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Unconditional reload: Expense creation now happens on confirm *inside* the
        // modal, not at sync time, so `report.created` no longer indicates whether new
        // Expenses exist — the previous `if (report.created > 0)` guard would miss
        // expenses confirmed during this dialog session (CA #6 of the handoff).
        const walletId = this.selectedWallet()?.id ?? null;
        this.expenseService.loadByWalletId(walletId);
      });
  }

  protected onTagsClick(expense: ExpenseListItem): void {
    const data: TagPickerDialogData = {
      availableTags: this.tags(),
      selectedTagIds: expense.tagIds,
    };

    this.dialog
      .open<TagPickerDialogComponent, TagPickerDialogData, TagPickerDialogResult>(
        TagPickerDialogComponent,
        { width: '26rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((selectedTagIds) => {
        if (selectedTagIds === undefined) return;
        this.expenseService
          .assignTags(expense.id, selectedTagIds)
          .pipe(takeUntilDestroyed(this.destroyRef))
          // Error is not lost — ExpenseService.patch() already pushed the message onto
          // errorSubject (rendered via errorMessage() in the template). This handler exists
          // only to stop the rejection from surfacing as unhandled.
          .subscribe({ error: () => undefined });
      });
  }

  protected openViewer(expense: ExpenseListItem): void {
    const walletId = this.selectedWallet()?.id ?? null;
    this.omegaViewerLauncher
      .open({ kind: 'EXPENSE', id: expense.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.mutated) this.expenseService.loadByWalletId(walletId);
      });
  }

  protected onDeleteClick(expense: ExpenseListItem): void {
    this.dialog
      .open<ExpenseDeleteDialogComponent, ExpenseDeleteDialogData, boolean>(
        ExpenseDeleteDialogComponent,
        {
          width: '32rem',
          maxWidth: 'calc(100vw - 2rem)',
          data: { expenseName: expense.name, cost: expense.cost },
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.deleteExpense(expense.id);
      });
  }

  private deleteExpense(id: string): void {
    this.expenseService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => undefined, error: () => undefined });
  }

  private payExpense(walletId: string, expenseId: string, payment: ExpensePaymentDialogResult): void {
    this.paymentService
      .payExpense({
        walletId,
        body: {
          payment: { amount: payment.amount, currency: 'BRL', paymentDate: new Date().toISOString(), details: payment.details },
          bulletId: payment.bulletId,
          expenseId,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const id = this.selectedWallet()?.id ?? null;
          this.bulletService.loadByWalletId(id);
          this.expenseService.loadByWalletId(id);
          this.paymentService.loadByWalletId(id);
        },
        error: () => undefined,
      });
  }

  private resetForm(): void {
    this.form.controls.installmentCharges.clearValidators();
    this.form.controls.installmentCharges.updateValueAndValidity();
    this.form.reset({
      name: '',
      cost: 0,
      purchaseDate: this.today(),
      creditCardId: '',
      isInstallment: false,
      installmentCharges: 0,
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
