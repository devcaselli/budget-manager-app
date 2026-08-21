import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, catchError, concatMap, finalize, from, throwError, toArray } from 'rxjs';

import {
  ReservedBudgetDeleteBlockingMigration,
  ReservedBudgetDeleteModeDialogComponent,
  ReservedBudgetDeleteModeDialogData,
  ReservedBudgetDeleteModeDialogResult,
} from '../../components/reserved-budget-delete-mode-dialog/reserved-budget-delete-mode-dialog.component';
import {
  ReservedBudgetLinkDialogComponent,
  ReservedBudgetLinkDialogData,
  ReservedBudgetLinkDialogResult,
  ReservedBudgetLinkSourceOption,
} from '../../components/reserved-budget-link-dialog/reserved-budget-link-dialog.component';
import {
  ReservedBudgetMigrationDialogBullet,
  ReservedBudgetMigrationDialogComponent,
  ReservedBudgetMigrationDialogData,
  ReservedBudgetMigrationDialogResult,
} from '../../components/reserved-budget-migration-dialog/reserved-budget-migration-dialog.component';
import {
  isMigrationNotReversibleProblem,
  ReservedBudget,
  ReservedBudgetDeleteMode,
  ReservedBudgetLink,
  ReservedBudgetLinkSourceType,
  ReservedBudgetMigration,
  UpdateReservedBudgetRequest,
} from '../../models/reserved-budget';
import { ReservedBudgetService } from '../../services/reserved-budget.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { BulletService } from '@features/bullet/services/bullet.service';
import { ExtraBudgetService } from '@features/extra-budget/services/extra-budget.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { formatBrl } from '@shared/utils/currency';
import {
  ViewerRevertConfirmDialogComponent,
  ViewerRevertConfirmDialogData,
} from '@shared/components/omega-viewer/sections/viewer-revert-confirm-dialog.component';

interface ReservedBudgetVersionView {
  readonly effectiveMonth: string;
  readonly amount: string;
}

interface ReservedBudgetLinkView {
  readonly sourceType: ReservedBudgetLinkSourceType;
  readonly sourceId: string;
  readonly fromMonth: string;
  readonly label: string;
}

/**
 * View model for one migration chip. Consumed by both the card (RBM-F4) and — per the 3rd-round
 * note in the plan doc — `blockingMigrations` of the delete-modality dialog (RBM-F13) and its
 * chained undo-and-end/skip shortcut (RBM-F12a), which need `extraBudgetId` (for the DELETE),
 * `bulletLabel`/`amount` (for the confirmation text) and `amountValue` (for the summary total).
 * None of these 5 fields may be dropped as "unused by the card" without checking those callers.
 */
interface ReservedBudgetMigrationView {
  readonly extraBudgetId: string;
  readonly bulletId: string;
  readonly bulletLabel: string;
  readonly amount: string;
  readonly amountValue: number;
}

interface ReservedBudgetListItem {
  readonly id: string;
  readonly description: string;
  readonly details: string | null;
  readonly currency: string;
  readonly amountValue: number;
  readonly amount: string;
  readonly startMonthValue: string;
  readonly startMonth: string;
  readonly versionCount: number;
  readonly versions: readonly ReservedBudgetVersionView[];
  readonly links: readonly ReservedBudgetLinkView[];
  readonly migrations: readonly ReservedBudgetMigrationView[];
  /** True when the backend supplied consumed/remaining for this row (false on the plain list). */
  readonly hasConsumption: boolean;
  readonly consumed: string | null;
  readonly remaining: string | null;
  /** Raw `remainingAmount` for the viewed month; `null` when `hasConsumption` is false. Used as
   * the migration cap (RBM-F3/F5/F6) instead of reparsing the formatted `remaining` string. */
  readonly remainingValue: number | null;
  /** 0–100; consumed share of the ceiling. 0 when consumption data is absent. */
  readonly consumedProgress: number;
  /** True when this reserve can be migrated from: consumption data is present (implies the
   * viewed month, not just "now"), remaining balance is positive, and a wallet is selected. */
  readonly canMigrate: boolean;
}

@Component({
  selector: 'app-reserved-budget-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './reserved-budget-page.html',
  styleUrl: './reserved-budget-page.scss',
})
export class ReservedBudgetPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly reservedBudgetService = inject(ReservedBudgetService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly installmentService = inject(InstallmentService);
  private readonly bulletService = inject(BulletService);
  private readonly extraBudgetService = inject(ExtraBudgetService);
  private readonly walletService = inject(WalletService);

  private readonly reservedBudgets = toSignal(this.reservedBudgetService.reservedBudgets$, {
    initialValue: [],
  });
  private readonly subscriptions = toSignal(this.subscriptionService.subscriptions$, {
    initialValue: [],
  });
  private readonly installments = toSignal(this.installmentService.allInstallments$, {
    initialValue: [],
  });
  private readonly bullets = toSignal(this.bulletService.bullets$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly editingReservedBudgetId$ = new BehaviorSubject<string | null>(null);

  // Earliest month the edited amount may take effect (the budget's startMonth); null when creating.
  private editMinEffectiveMonthValue: string | null = null;
  // Amount loaded into the form when editing started; lets us skip effectiveMonth if it is untouched.
  private editOriginalAmount: number | null = null;

  protected readonly isLoading = toSignal(this.reservedBudgetService.loading$, {
    initialValue: false,
  });
  protected readonly isSaving = toSignal(this.reservedBudgetService.saving$, { initialValue: false });
  protected readonly updatingReservedBudgetId = toSignal(this.reservedBudgetService.updating$, {
    initialValue: null,
  });
  protected readonly linkingReservedBudgetId = toSignal(this.reservedBudgetService.linking$, {
    initialValue: null,
  });
  protected readonly migratingReservedBudgetId = toSignal(this.reservedBudgetService.migrating$, {
    initialValue: null,
  });
  protected readonly deletingReservedBudgetId = toSignal(this.reservedBudgetService.deleting$, {
    initialValue: null,
  });
  protected readonly errorMessage = toSignal(this.reservedBudgetService.error$, {
    initialValue: null,
  });
  protected readonly editingReservedBudgetId = toSignal(this.editingReservedBudgetId$, {
    initialValue: null,
  });

  /**
   * Post-epic code review MAJOR 5: `migratingReservedBudgetId`/`deletingReservedBudgetId` above
   * are last-writer-wins signals off `ReservedBudgetService` — during `confirmDeleteWithUndo()`'s
   * `concatMap` chain (N migration-undo DELETEs, then the reserve's own DELETE) they flip through
   * `id` → `null` → `id` between EACH request, so the card's disabled state visibly blinks
   * on/off instead of staying steadily disabled for the whole chain — reads as instability, not
   * progress. This is a separate, page-local signal set BEFORE the chain starts and cleared in
   * `finalize()`, driving one disabled/busy state across the ENTIRE chain regardless of which
   * individual request is in flight at any given moment.
   */
  private readonly chainedDeleteBusyId$ = new BehaviorSubject<string | null>(null);
  protected readonly chainedDeleteBusyId = toSignal(this.chainedDeleteBusyId$, {
    initialValue: null,
  });

  /**
   * Post-epic code review MAJOR 4: fallback surface for `reopenDeleteModeDialogAfterPartialFailure()`
   * when the reserve it tried to reopen the dialog for no longer exists in `page.content` (e.g. a
   * prior chain attempt already fully succeeded, and this is a stale retry racing behind it) — that
   * branch used to `return` with zero user-visible feedback. Rendered as a page-level alert, same
   * spot `errorMessage()` already renders, since there's no dialog left to show it in.
   */
  private readonly chainedDeleteFailureMessage$ = new BehaviorSubject<string | null>(null);
  protected readonly chainedDeleteFailureMessage = toSignal(this.chainedDeleteFailureMessage$, {
    initialValue: null,
  });

  // budget: positive, <= 2 decimal digits, mirrors backend (positive, max 12 int + 2 fraction).
  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    details: ['', Validators.maxLength(255)],
    budget: [0, [Validators.required, Validators.min(0.01), Validators.pattern(/^\d{1,12}(\.\d{1,2})?$/)]],
    currency: ['BRL', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    effectiveMonth: [
      this.currentMonth(),
      [Validators.required, (control: AbstractControl<string>) => this.validateMinEffectiveMonth(control)],
    ],
  });

  private readonly subscriptionOptions = computed<readonly ReservedBudgetLinkSourceOption[]>(() =>
    this.subscriptions().map((sub) => ({ id: sub.id, label: sub.description })),
  );

  private readonly installmentOptions = computed<readonly ReservedBudgetLinkSourceOption[]>(() =>
    this.installments().map((inst) => ({
      id: inst.id,
      label: `${inst.description} · ${inst.installmentNumber}x`,
    })),
  );

  // Bullet picker options for the migration dialog (RBM-F5/F6) — `remaining` pre-formatted so
  // the dialog's <option> never re-derives currency formatting for a value it only displays.
  private readonly migrationBulletOptions = computed<readonly ReservedBudgetMigrationDialogBullet[]>(
    () =>
      this.bullets().map((bullet) => ({
        id: bullet.id,
        description: bullet.description,
        remaining: this.formatCurrency(bullet.remaining, 'BRL'),
      })),
  );

  private readonly sourceLabels = computed<ReadonlyMap<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const option of this.subscriptionOptions()) labels.set(option.id, option.label);
    for (const option of this.installmentOptions()) labels.set(option.id, option.label);
    return labels;
  });

  protected readonly reservedBudgetItems = computed<readonly ReservedBudgetListItem[]>(() =>
    this.reservedBudgets().map((budget) => this.toListItem(budget)),
  );

  protected readonly activeCount = computed(() => this.reservedBudgetItems().length);

  protected readonly reservedTotal = computed(() => {
    const total = this.reservedBudgetItems().reduce((acc, item) => acc + item.amountValue, 0);
    return formatBrl(total);
  });

  protected readonly hasEditingReservedBudget = computed(
    () => this.editingReservedBudgetId() !== null,
  );

  protected readonly editingReservedBudget = computed<ReservedBudgetListItem | null>(() => {
    const editingId = this.editingReservedBudgetId();
    if (!editingId) return null;
    return this.reservedBudgetItems().find((item) => item.id === editingId) ?? null;
  });

  // Earliest month the new amount may take effect (the edited budget's startMonth); null when creating.
  protected readonly editMinEffectiveMonth = computed<string | null>(
    () => this.editingReservedBudget()?.startMonthValue ?? null,
  );

  protected readonly editMinEffectiveMonthLabel = computed<string | null>(
    () => this.editingReservedBudget()?.startMonth ?? null,
  );

  constructor() {
    this.subscriptionService.loadSubscriptions();

    // The reserved-budget month follows the selected wallet's effectiveMonth (the month the
    // user is viewing), not the real-world current month. Reload whenever it changes.
    effect(() => {
      const wallet = this.selectedWallet();
      this.installmentService.loadByWalletId(wallet?.id ?? null);
      // Bullets aren't needed to resolve migration labels (bulletDescription already arrives
      // resolved from the backend, RBM-F1) — they're loaded here for the migration dialog's
      // bullet picker and each option's `remaining` figure (RBM-F5).
      this.bulletService.loadByWalletId(wallet?.id ?? null);
      this.reservedBudgetService.loadReservedBudgets(wallet?.effectiveMonth);
    });
  }

  protected submitReservedBudget(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const editingId = this.editingReservedBudgetId();
    const value = this.form.getRawValue();

    if (editingId) {
      this.reservedBudgetService
        .update(editingId, this.buildUpdateRequest(value))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => this.resetForm(), error: () => undefined });
      return;
    }

    this.reservedBudgetService
      .create({
        description: value.description.trim(),
        details: value.details.trim() || null,
        budget: value.budget,
        currency: value.currency.toUpperCase(),
        effectiveMonth: value.effectiveMonth,
        flag: 'NONE',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.resetForm(), error: () => undefined });
  }

  protected editReservedBudget(item: ReservedBudgetListItem): void {
    this.editingReservedBudgetId$.next(item.id);
    // The new amount cannot take effect before the budget's startMonth (backend rule).
    this.editMinEffectiveMonthValue = item.startMonthValue;
    this.editOriginalAmount = item.amountValue;
    this.form.reset({
      description: item.description,
      details: item.details ?? '',
      budget: item.amountValue,
      currency: item.currency,
      effectiveMonth: this.defaultEditEffectiveMonth(item.startMonthValue),
    });
    // Currency stays locked; the effective month is editable so a new amount can apply from a later month.
    this.form.controls.currency.disable();
    this.form.controls.effectiveMonth.enable();
    this.form.controls.effectiveMonth.updateValueAndValidity();
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  protected deleteReservedBudget(item: ReservedBudgetListItem): void {
    const wallet = this.selectedWallet();
    // No target month, nothing to operate on — same guard shape as openMigrationDialog.
    if (!wallet) return;

    this.openDeleteModeDialog(item, wallet.id, wallet.effectiveMonth);
  }

  private openDeleteModeDialog(
    item: ReservedBudgetListItem,
    walletId: string,
    effectiveMonth: string,
    errorMessage?: string,
  ): void {
    const blockingMigrations: readonly ReservedBudgetDeleteBlockingMigration[] = item.migrations.map(
      (migration) => ({
        extraBudgetId: migration.extraBudgetId,
        bulletLabel: migration.bulletLabel,
        amount: migration.amount,
        amountValue: migration.amountValue,
      }),
    );

    const data: ReservedBudgetDeleteModeDialogData = {
      description: item.description,
      effectiveMonthLabel: this.formatMonth(effectiveMonth),
      blockingMigrations,
      errorMessage,
    };

    this.dialog
      .open<
        ReservedBudgetDeleteModeDialogComponent,
        ReservedBudgetDeleteModeDialogData,
        ReservedBudgetDeleteModeDialogResult
      >(ReservedBudgetDeleteModeDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (!result) return;

        if (result.undoBlockingMigrationsFirst) {
          this.confirmDeleteWithUndo(item, result.mode, walletId, effectiveMonth);
        } else {
          this.confirmDelete(item.id, result.mode, walletId);
        }
      });
  }

  protected openLinkDialog(item: ReservedBudgetListItem): void {
    // Hide sources already linked to this RB so they can't be linked twice.
    const linkedIds = new Set(item.links.map((link) => link.sourceId));
    const notLinked = (option: ReservedBudgetLinkSourceOption): boolean => !linkedIds.has(option.id);

    const data: ReservedBudgetLinkDialogData = {
      reservedBudgetDescription: item.description,
      subscriptions: this.subscriptionOptions().filter(notLinked),
      installments: this.installmentOptions().filter(notLinked),
      hasWallet: this.selectedWallet() !== null,
    };

    this.dialog
      .open<
        ReservedBudgetLinkDialogComponent,
        ReservedBudgetLinkDialogData,
        ReservedBudgetLinkDialogResult
      >(ReservedBudgetLinkDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.linkSource(item.id, result);
      });
  }

  protected openMigrationDialog(item: ReservedBudgetListItem): void {
    const wallet = this.selectedWallet();
    // The button is already disabled without a wallet (RBM-F3's canMigrate), but the request
    // must not depend on visual state alone — no non-null assertion.
    if (!wallet) return;

    const data: ReservedBudgetMigrationDialogData = {
      reservedBudgetDescription: item.description,
      availableValue: item.remainingValue ?? 0,
      availableLabel: item.remaining ?? item.amount,
      currency: item.currency,
      effectiveMonthLabel: this.formatMonth(wallet.effectiveMonth),
      bullets: this.migrationBulletOptions(),
    };

    this.dialog
      .open<
        ReservedBudgetMigrationDialogComponent,
        ReservedBudgetMigrationDialogData,
        ReservedBudgetMigrationDialogResult
      >(ReservedBudgetMigrationDialogComponent, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.createMigration(item.id, result);
      });
  }

  // Confirmed via the shared viewer-revert-confirm-dialog (RBM-F7) rather than deleteMigration()
  // called straight from the chip — undoing a migration moves real money, and it's the only one
  // of this card's 4 actions that does. The dialog's bodyOverride spells out both sides of the
  // movement (amount, source bullet, destination reserve, month) instead of the generic
  // payment-revert copy — the reader isn't reverting a payment, they're moving money back.
  protected undoMigration(item: ReservedBudgetListItem, migration: ReservedBudgetMigrationView): void {
    const monthLabel = this.formatMonth(this.selectedWallet()?.effectiveMonth ?? item.startMonthValue);
    const data: ViewerRevertConfirmDialogData = {
      dateLabel: monthLabel,
      bodyOverride:
        `Undo this migration? ${migration.amount} will leave the bullet ` +
        `"${migration.bulletLabel}" and return to the reserved budget "${item.description}" ` +
        `for ${monthLabel}.`,
    };

    this.dialog
      .open<ViewerRevertConfirmDialogComponent, ViewerRevertConfirmDialogData, boolean>(
        ViewerRevertConfirmDialogComponent,
        { width: '30rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.confirmUndoMigration(item.id, migration.extraBudgetId);
      });
  }

  protected unlinkSource(item: ReservedBudgetListItem, link: ReservedBudgetLinkView): void {
    this.reservedBudgetService
      .unlink(item.id, link.sourceType, link.sourceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadForViewedMonth(), error: () => undefined });
  }

  private linkSource(id: string, result: ReservedBudgetLinkDialogResult): void {
    this.reservedBudgetService
      .link(id, {
        sourceType: result.sourceType,
        sourceId: result.sourceId,
        fromMonth: result.fromMonth,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadForViewedMonth(), error: () => undefined });
  }

  private createMigration(id: string, result: ReservedBudgetMigrationDialogResult): void {
    const wallet = this.selectedWallet();
    if (!wallet) return;

    this.reservedBudgetService
      .createMigration(id, {
        walletId: wallet.id,
        bulletId: result.bulletId,
        amount: result.amount,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadAfterMigration(), error: () => undefined });
  }

  // Same reload as createMigration's success path — same 3 stores change either way. Reused as
  // the one definition of "how to reload after a migration write" (RBM-F7); RBM-F16's Omega
  // Viewer undo entry point is expected to call reservedBudgetService.deleteMigration() and
  // apply the same reload rather than inventing its own.
  private confirmUndoMigration(reservedBudgetId: string, extraBudgetId: string): void {
    this.reservedBudgetService
      .deleteMigration(reservedBudgetId, extraBudgetId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.reloadAfterMigration(), error: () => undefined });
  }

  // link/unlink responses carry current-month figures; reload so the list reflects the
  // wallet's viewed month instead.
  private reloadForViewedMonth(): void {
    this.reservedBudgetService.loadReservedBudgets(this.selectedWallet()?.effectiveMonth);
  }

  // Migration moves money across 3 stores (RB, Bullet, ExtraBudget) — mirrors the fan-out
  // reload already used by reloadWalletContext() in extra-budget-page.ts/bullet-page.ts, plus
  // the RB reload that fan-out doesn't cover (decision #7). walletService.loadWallets() is
  // deliberately NOT included: migration moves money *between* two containers of the same
  // wallet, so the wallet's own aggregate totals don't change. If integration testing ever
  // shows a wallet-level aggregate reflecting migrations, add that load and document why here
  // — don't add it preemptively "to be safe", which is how reload fan-outs turn into cascades.
  private reloadAfterMigration(): void {
    const wallet = this.selectedWallet();
    this.reservedBudgetService.loadReservedBudgets(wallet?.effectiveMonth);
    this.bulletService.loadByWalletId(wallet?.id ?? null);
    this.extraBudgetService.loadByWalletId(wallet?.id ?? null);
  }

  // Normal path (no blocking migration). Reloads the viewed month only (P5, RBM-F13) — the
  // reserve itself is the only thing that changed, unlike the chained-undo path below.
  private confirmDelete(id: string, mode: ReservedBudgetDeleteMode, walletId: string): void {
    this.reservedBudgetService
      .delete(id, mode, walletId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.editingReservedBudgetId() === id) this.resetForm();
          this.reloadForViewedMonth();
        },
        error: () => undefined,
      });
  }

  /**
   * Chained "Undo and end/skip" shortcut (RBM-F12a). Sequential by design — concatMap, never
   * forkJoin: a partial failure (bullet already spent one of the migrated amounts, 409
   * MigrationNotReversibleException) must stop deterministically at the failing item rather than
   * leaving a non-deterministic subset undone. Reuses reservedBudgetService.deleteMigration()
   * (RBM-F2) and .delete() (this task) exclusively — zero new service method for the shortcut,
   * per RBM-F13/RBM-F16 rule 1 (one write path for migration revert).
   *
   * Post-epic code review MAJOR 5: `chainedDeleteBusyId$` is set BEFORE the chain starts and
   * cleared in `finalize()` — drives one steady disabled/busy state on the card for the whole
   * chain (see that signal's own doc comment), instead of the per-request
   * `migratingReservedBudgetId`/`deletingReservedBudgetId` flicker this used to produce.
   */
  private confirmDeleteWithUndo(
    item: ReservedBudgetListItem,
    mode: ReservedBudgetDeleteMode,
    walletId: string,
    effectiveMonth: string,
  ): void {
    const migrations = item.migrations;
    this.chainedDeleteBusyId$.next(item.id);

    from(migrations)
      .pipe(
        concatMap((migration) =>
          this.reservedBudgetService.deleteMigration(item.id, migration.extraBudgetId).pipe(
            // Post-epic code review MAJOR 4: tag a failure with which migration it happened on
            // (the plain service error has no bulletLabel — only bulletId, which isn't what the
            // required copy shows) so the subscribe's error handler can build the exact spec
            // RBM-F12a message ("...to {bulletLabel}...") without re-deriving it from status
            // codes alone.
            catchError((error: unknown) => throwError(() => ({ error, migration }))),
          ),
        ),
        toArray(),
        concatMap(() => this.reservedBudgetService.delete(item.id, mode, walletId)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.chainedDeleteBusyId$.next(null)),
      )
      .subscribe({
        next: () => {
          // All migrations undone AND the reserve deleted/skipped — money moved in 3 stores plus
          // the reserve itself. reloadAfterMigration() (RBM-F6), not reloadForViewedMonth() alone
          // — copying confirmDelete's plain reload here would leave bullet/ExtraBudget stale.
          if (this.editingReservedBudgetId() === item.id) this.resetForm();
          this.reloadAfterMigration();
        },
        error: (failure: unknown) => {
          // Money already moved for whichever migrations succeeded before the failure (0..K-1) —
          // that state change is real and must be reflected, even though the chain didn't finish.
          // No compensating rollback (RBM-F12a): recreating an undone migration or recreating a
          // deleted reserve would itself be an unsolicited money-moving write.
          this.reloadAfterMigration();
          this.reopenDeleteModeDialogAfterPartialFailure(
            item.id,
            walletId,
            effectiveMonth,
            this.describeChainedDeleteFailure(failure),
          );
        },
      });
  }

  /**
   * Post-epic code review MAJOR 4: builds the spec RBM-F12a copy — "Couldn't undo the migration
   * to {bulletLabel} — the bullet has already spent the amount" — for the 409
   * MigrationNotReversibleException case, with a generic fallback for anything else (the reserve's
   * own DELETE failing, a network error, etc.), so the reopened dialog is never blank about why
   * the shortcut stopped.
   */
  private describeChainedDeleteFailure(failure: unknown): string {
    const tagged = failure as { error?: unknown; migration?: ReservedBudgetMigrationView } | null;
    const error = tagged?.error ?? failure;
    const bulletLabel = tagged?.migration?.bulletLabel;

    if (error instanceof HttpErrorResponse && error.status === 409 && bulletLabel) {
      const body: unknown = error.error;
      if (isMigrationNotReversibleProblem(body)) {
        return `Couldn't undo the migration to ${bulletLabel} — the bullet has already spent the amount.`;
      }
    }
    return 'Não foi possível concluir a remoção — algumas migrations podem já ter sido desfeitas. Tente novamente.';
  }

  // Reopens the delete-mode dialog with the reserve's now-current state (fewer or zero blocking
  // migrations) rather than mutating the closed dialog's data in place — keeps the dialog purely
  // presentational (no public mutable API), per RBM-F12a's documented "close and reopen" choice.
  // Fetches the fresh state directly via findActiveAt() instead of reading reservedBudgetItems():
  // reloadAfterMigration() above only *triggers* the store reload (loadReservedBudgets() pushes
  // onto a Subject consumed asynchronously by an HTTP switchMap) — reading the signal synchronously
  // right after would still see the pre-chain list and reopen with stale blockingMigrations.
  //
  // Post-epic code review MAJOR 4: the `!reservedBudget` branch (reached after a fully-successful
  // chain — e.g. a prior attempt's END already removed it — followed by a stale retry) used to
  // `return` silently, leaving the user with no dialog and no feedback at all. It now surfaces the
  // same errorMessage on the page itself, since there's no reserve left to reopen a dialog for.
  private reopenDeleteModeDialogAfterPartialFailure(
    reservedBudgetId: string,
    walletId: string,
    effectiveMonth: string,
    errorMessage: string,
  ): void {
    this.reservedBudgetService
      .findActiveAt(effectiveMonth)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const reservedBudget = page.content.find((rb) => rb.id === reservedBudgetId);
          if (!reservedBudget) {
            this.chainedDeleteFailureMessage$.next(errorMessage);
            return;
          }

          this.openDeleteModeDialog(
            this.toListItem(reservedBudget),
            walletId,
            effectiveMonth,
            errorMessage,
          );
        },
        error: () => this.chainedDeleteFailureMessage$.next(errorMessage),
      });
  }

  private toListItem(budget: ReservedBudget): ReservedBudgetListItem {
    const versions = [...budget.versions].sort((a, b) =>
      b.effectiveMonth.localeCompare(a.effectiveMonth),
    );
    const currentVersion = versions[0];
    const amountValue = Number(currentVersion?.amount ?? 0);
    const consumption = this.toConsumptionView(budget);
    // hasConsumption implies the list is scoped to the viewed month (activeAt listing) — no
    // separate "not the current month" check is needed on top of it (decision #2).
    const canMigrate =
      consumption.hasConsumption &&
      (consumption.remainingValue ?? 0) > 0 &&
      this.selectedWallet() !== null;

    return {
      id: budget.id,
      description: budget.description,
      details: budget.details,
      currency: budget.currency,
      amountValue,
      amount: this.formatCurrency(amountValue, budget.currency),
      startMonthValue: budget.startMonth,
      startMonth: this.formatMonth(budget.startMonth),
      versionCount: versions.length,
      versions: versions.map((version) => ({
        effectiveMonth: this.formatMonth(version.effectiveMonth),
        amount: this.formatCurrency(Number(version.amount), budget.currency),
      })),
      links: budget.links.map((link) => this.toLinkView(link)),
      migrations: (budget.migrations ?? []).map((migration) =>
        this.toMigrationView(migration, budget.currency),
      ),
      ...consumption,
      canMigrate,
    };
  }

  // The backend only fills consumed/remaining on the active-at listing, link and detail
  // responses; guard against null so the plain list never renders NaN.
  private toConsumptionView(budget: ReservedBudget): {
    hasConsumption: boolean;
    consumed: string | null;
    remaining: string | null;
    remainingValue: number | null;
    consumedProgress: number;
  } {
    const consumed = budget.consumedAmount;
    const remaining = budget.remainingAmount;
    if (consumed == null || remaining == null) {
      return {
        hasConsumption: false,
        consumed: null,
        remaining: null,
        remainingValue: null,
        consumedProgress: 0,
      };
    }

    const consumedValue = Number(consumed);
    const remainingValue = Number(remaining);
    const ceiling = consumedValue + remainingValue;
    const progress = ceiling > 0 ? Math.min((consumedValue / ceiling) * 100, 100) : 0;

    return {
      hasConsumption: true,
      consumed: this.formatCurrency(consumedValue, budget.currency),
      remaining: this.formatCurrency(remainingValue, budget.currency),
      remainingValue,
      consumedProgress: progress,
    };
  }

  private toLinkView(link: ReservedBudgetLink): ReservedBudgetLinkView {
    return {
      sourceType: link.sourceType,
      sourceId: link.sourceId,
      fromMonth: this.formatMonth(link.fromMonth),
      label: this.sourceLabels().get(link.sourceId) ?? link.sourceId,
    };
  }

  // bulletDescription arrives already resolved from the backend (RBM-F1) — no Map/lookup by id
  // needed here, unlike sourceLabels() above. Falling back to the raw bulletId mirrors the same
  // fallback grammar as toLinkView() so the UI never shows `undefined`.
  private toMigrationView(
    migration: ReservedBudgetMigration,
    currency: string,
  ): ReservedBudgetMigrationView {
    return {
      extraBudgetId: migration.extraBudgetId,
      bulletId: migration.bulletId,
      bulletLabel: migration.bulletDescription || migration.bulletId,
      amount: this.formatCurrency(migration.amount, currency),
      amountValue: migration.amount,
    };
  }

  private formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }

  private formatMonth(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  private resetForm(): void {
    this.editingReservedBudgetId$.next(null);
    this.editMinEffectiveMonthValue = null;
    this.editOriginalAmount = null;
    this.form.controls.currency.enable();
    this.form.controls.effectiveMonth.enable();
    this.form.reset({
      description: '',
      details: '',
      budget: 0,
      currency: 'BRL',
      effectiveMonth: this.currentMonth(),
    });
  }

  private buildUpdateRequest(value: {
    description: string;
    details: string;
    budget: number;
    effectiveMonth: string;
  }): UpdateReservedBudgetRequest {
    const request: UpdateReservedBudgetRequest = {
      description: value.description.trim(),
      details: value.details.trim() || null,
      newAmount: value.budget,
    };

    // effectiveMonth is meaningless without an amount change; only send it when the amount changed.
    if (this.editOriginalAmount !== null && value.budget !== this.editOriginalAmount) {
      return { ...request, effectiveMonth: value.effectiveMonth };
    }

    return request;
  }

  // Pre-fills the picker with the later of "now" and startMonth so the default is always valid.
  private defaultEditEffectiveMonth(startMonth: string): string {
    const now = this.currentMonth();
    return now >= startMonth ? now : startMonth;
  }

  private validateMinEffectiveMonth(control: AbstractControl<string>): ValidationErrors | null {
    const minMonth = this.editMinEffectiveMonthValue;
    if (!minMonth || !control.value) return null;
    return control.value < minMonth ? { minMonth: { min: minMonth, actual: control.value } } : null;
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
