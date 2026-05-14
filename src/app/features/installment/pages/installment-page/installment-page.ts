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
import { merge } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { WalletService } from '@features/wallet/services/wallet.service';

import { InstallmentService } from '../../services/installment.service';
import { Installment, InstallmentSortOrder, PatchInstallmentRequest, SaveInstallmentRequest } from '../../models/installment';
import {
  InstallmentDeleteDialogComponent,
  InstallmentDeleteDialogData,
} from '../../components/installment-delete-dialog/installment-delete-dialog.component';
import {
  InstallmentCreateDialogComponent,
  InstallmentCreateDialogData,
  InstallmentCreateDialogResult,
} from '../../components/installment-create-dialog/installment-create-dialog.component';
import {
  InstallmentEditDialogComponent,
  InstallmentEditDialogCreditCard,
  InstallmentEditDialogData,
  InstallmentEditDialogResult,
} from '../../components/installment-edit-dialog/installment-edit-dialog.component';
import {
  InstallmentNotesDialogComponent,
  InstallmentNotesDialogData,
  InstallmentNotesDialogResult,
} from '../../components/installment-notes-dialog/installment-notes-dialog.component';

interface InstallmentListItem {
  readonly id: string;
  readonly description: string;
  readonly details: string | null | undefined;
  readonly creditCardId: string;
  readonly creditCardName: string;
  readonly purchaseDate: string;
  readonly purchaseDateLabel: string;
  readonly sourceEffectiveMonth: string;
  readonly currentInstallment: number;
  readonly totalInstallments: number;
  readonly progressPct: number;
  readonly installmentValue: number;
  readonly remainingAmount: number;
  readonly lastInstallmentDate: string;
}

interface MonthlyLoad {
  readonly label: string;
  readonly total: number;
  readonly height: string;
}

interface TooltipState {
  readonly label: string;
  readonly total: number;
  readonly x: number;
  readonly y: number;
}

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('en-US', { month: '2-digit', year: '2-digit', timeZone: 'UTC' });

@Component({
  selector: 'app-installment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, MatIconModule],
  templateUrl: './installment-page.html',
  styleUrl: './installment-page.scss',
})
export class InstallmentPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly installmentService = inject(InstallmentService);
  private readonly walletService = inject(WalletService);

  private readonly installments = toSignal(this.installmentService.installments$, { initialValue: [] });
  protected readonly creditCards = toSignal(this.installmentService.creditCards$, { initialValue: [] });
  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, { initialValue: null });

  protected readonly tooltip = signal<TooltipState | null>(null);
  protected readonly notesTooltip = signal<{ text: string; x: number; y: number } | null>(null);
  protected readonly isLoading = toSignal(this.installmentService.loading$, { initialValue: false });
  protected readonly deletingId = toSignal(this.installmentService.deleting$, { initialValue: null });
  protected readonly isSaving = toSignal(this.installmentService.saving$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.installmentService.error$, { initialValue: null });
  protected readonly filter = toSignal(this.installmentService.filter$, {
    initialValue: { creditCardId: null, sort: 'ENDING_SOON' as InstallmentSortOrder, page: 0, size: 7 },
  });
  protected readonly pagination = toSignal(this.installmentService.pagination$, {
    initialValue: { page: 0, size: 7, totalElements: 0, totalPages: 0 },
  });

  private readonly currentMonthKey = this.buildCurrentMonthKey();

  protected readonly listItems = computed<readonly InstallmentListItem[]>(() => {
    const cardMap = this.buildCreditCardMap();
    return this.installments().map((inst) => this.toListItem(inst, cardMap));
  });

  // ── Hero KPIs ────────────────────────────────────────────────────────────

  protected readonly openCount = computed(() => this.pagination().totalElements);

  protected readonly outstanding = computed(() =>
    this.installments().reduce((acc, inst) => {
      const remaining = this.remainingCharges(inst);
      return acc + inst.installmentValue * remaining;
    }, 0),
  );

  protected readonly thisCycleTotal = computed(() =>
    this.installments()
      .filter((inst) => this.isActiveInMonth(inst, this.currentMonthKey))
      .reduce((acc, inst) => acc + inst.installmentValue, 0),
  );

  protected readonly nextFinish = computed(() => {
    const dates = this.installments().map((inst) => inst.lastInstallmentDate);
    if (!dates.length) return '—';
    const earliest = dates.sort()[0];
    return this.formatMonthKey(earliest!);
  });

  protected readonly hasPrev = computed(() => this.pagination().page > 0);
  protected readonly hasNext = computed(() => this.pagination().page < this.pagination().totalPages - 1);
  protected readonly pageLabel = computed(() => {
    const p = this.pagination();
    if (p.totalElements === 0) return '0 results';
    const from = p.page * p.size + 1;
    const to = Math.min((p.page + 1) * p.size, p.totalElements);
    return `${from}–${to} of ${p.totalElements}`;
  });

  // ── Schedule chart ────────────────────────────────────────────────────────

  protected readonly scheduleMonths = computed<readonly MonthlyLoad[]>(() => {
    const installments = this.installments();
    if (!installments.length) return [];

    const lastMonth = installments.map((inst) => inst.lastInstallmentDate).sort().at(-1)!;
    const months = this.buildMonthRange(this.currentMonthKey, lastMonth);
    const totals = months.map((key) =>
      installments.reduce(
        (acc, inst) => acc + (this.isActiveInMonth(inst, key) ? inst.installmentValue : 0),
        0,
      ),
    );
    const max = Math.max(...totals, 0);

    return months.map((key, idx) => ({
      label: this.formatMonthKey(key),
      total: totals[idx]!,
      height: max > 0 ? `${Math.max((totals[idx]! / max) * 100, totals[idx]! > 0 ? 4 : 0)}%` : '0%',
    }));
  });

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      this.installmentService.loadByWalletId(walletId);
    });
  }

  // ── Filter / pagination actions ───────────────────────────────────────────

  protected onCreditCardFilterChange(creditCardId: string): void {
    this.installmentService.setFilter({ creditCardId: creditCardId || null });
  }

  protected onSortToggle(): void {
    const current = this.filter().sort;
    this.installmentService.setFilter({ sort: current === 'ENDING_SOON' ? 'ENDING_LATE' : 'ENDING_SOON' });
  }

  protected onPrevPage(): void {
    const page = this.pagination().page;
    if (page > 0) this.installmentService.setFilter({ page: page - 1 });
  }

  protected onNextPage(): void {
    const { page, totalPages } = this.pagination();
    if (page < totalPages - 1) this.installmentService.setFilter({ page: page + 1 });
  }

  // ── Dialog actions ────────────────────────────────────────────────────────

  protected onNewClick(): void {
    const data: InstallmentCreateDialogData = { creditCards: this.creditCards() };

    const dialogRef = this.dialog.open<
      InstallmentCreateDialogComponent,
      InstallmentCreateDialogData,
      InstallmentCreateDialogResult
    >(InstallmentCreateDialogComponent, { width: '32rem', maxWidth: 'calc(100vw - 2rem)', data });

    merge(dialogRef.componentInstance.submitted, dialogRef.afterClosed())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.saveInstallment(result);
      });
  }

  protected onNotesClick(item: InstallmentListItem): void {
    const data: InstallmentNotesDialogData = {
      description: item.description,
      details: item.details,
    };

    this.dialog
      .open<InstallmentNotesDialogComponent, InstallmentNotesDialogData, InstallmentNotesDialogResult>(
        InstallmentNotesDialogComponent,
        { width: '28rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result != null) this.patchInstallment(item.id, result);
      });
  }

  protected onEditClick(item: InstallmentListItem): void {
    const data: InstallmentEditDialogData = {
      id: item.id,
      description: item.description,
      installmentValue: item.installmentValue,
      installmentNumber: item.totalInstallments,
      purchaseDate: item.purchaseDate,
      sourceEffectiveMonth: item.sourceEffectiveMonth,
      creditCardId: item.creditCardId,
      creditCards: this.creditCards() as readonly InstallmentEditDialogCreditCard[],
    };

    this.dialog
      .open<InstallmentEditDialogComponent, InstallmentEditDialogData, InstallmentEditDialogResult>(
        InstallmentEditDialogComponent,
        { width: '32rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result != null) this.patchInstallment(item.id, result);
      });
  }

  protected onDeleteClick(item: InstallmentListItem): void {
    const data: InstallmentDeleteDialogData = { description: item.description };

    this.dialog
      .open<InstallmentDeleteDialogComponent, InstallmentDeleteDialogData, boolean>(
        InstallmentDeleteDialogComponent,
        { width: '28rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.deleteInstallment(item.id);
      });
  }

  protected showNotesTooltip(event: MouseEvent, text: string): void {
    this.notesTooltip.set({ text, x: event.clientX, y: event.clientY });
  }

  protected moveNotesTooltip(event: MouseEvent): void {
    const current = this.notesTooltip();
    if (current) this.notesTooltip.set({ ...current, x: event.clientX, y: event.clientY });
  }

  protected hideNotesTooltip(): void {
    this.notesTooltip.set(null);
  }

  protected showTooltip(event: MouseEvent, month: MonthlyLoad): void {
    this.tooltip.set({ label: month.label, total: month.total, x: event.clientX, y: event.clientY });
  }

  protected moveTooltip(event: MouseEvent): void {
    const current = this.tooltip();
    if (current) this.tooltip.set({ ...current, x: event.clientX, y: event.clientY });
  }

  protected hideTooltip(): void {
    this.tooltip.set(null);
  }

  private saveInstallment(result: InstallmentCreateDialogResult): void {
    const request: SaveInstallmentRequest = {
      description: result.description,
      currency: result.currency,
      installmentNumber: result.installmentNumber,
      purchaseDate: result.purchaseDate,
      creditCardId: result.creditCardId,
      sourceEffectiveMonth: result.sourceEffectiveMonth,
      ...(result.installmentValue != null ? { installmentValue: result.installmentValue } : {}),
      ...(result.originalValue != null ? { originalValue: result.originalValue } : {}),
    };

    this.installmentService
      .save(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  private patchInstallment(id: string, result: PatchInstallmentRequest): void {
    this.installmentService
      .patch(id, result)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  private deleteInstallment(id: string): void {
    this.installmentService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  private toListItem(inst: Installment, cardMap: ReadonlyMap<string, string>): InstallmentListItem {
    const current = this.elapsedCharges(inst);
    const remaining = inst.installmentNumber - current;
    const progressPct =
      inst.installmentNumber > 0
        ? Math.min(Math.round((current / inst.installmentNumber) * 100), 100)
        : 0;

    return {
      id: inst.id,
      description: inst.description,
      details: inst.details,
      creditCardId: inst.creditCardId,
      creditCardName: cardMap.get(inst.creditCardId) ?? inst.creditCardId,
      purchaseDate: inst.purchaseDate,
      sourceEffectiveMonth: inst.sourceEffectiveMonth,
      purchaseDateLabel: this.formatDate(inst.purchaseDate),
      currentInstallment: current,
      totalInstallments: inst.installmentNumber,
      progressPct,
      installmentValue: inst.installmentValue,
      remainingAmount: inst.installmentValue * Math.max(remaining, 0),
      lastInstallmentDate: this.formatMonthKey(inst.lastInstallmentDate),
    };
  }

  private elapsedCharges(inst: Installment): number {
    const start = this.parseMonthKey(inst.sourceEffectiveMonth);
    const now = this.parseMonthKey(this.currentMonthKey);
    const elapsed =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth()) +
      1;
    return Math.min(Math.max(elapsed, 0), inst.installmentNumber);
  }

  private remainingCharges(inst: Installment): number {
    return Math.max(inst.installmentNumber - this.elapsedCharges(inst), 0);
  }

  private isActiveInMonth(inst: Installment, monthKey: string): boolean {
    return monthKey >= inst.sourceEffectiveMonth && monthKey <= inst.lastInstallmentDate;
  }

  private buildMonthRange(from: string, to: string): readonly string[] {
    const months: string[] = [];
    let current = this.parseMonthKey(from);
    const end = this.parseMonthKey(to);

    while (
      current.getFullYear() < end.getFullYear() ||
      (current.getFullYear() === end.getFullYear() && current.getMonth() <= end.getMonth())
    ) {
      months.push(this.monthKey(current));
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    return months;
  }

  private buildCreditCardMap(): ReadonlyMap<string, string> {
    return new Map(this.creditCards().map((c) => [c.id, c.name]));
  }

  private buildCurrentMonthKey(): string {
    return this.monthKey(new Date());
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private parseMonthKey(key: string): Date {
    const [year, month] = key.split('-').map(Number);
    return new Date(year!, month! - 1, 1);
  }

  private formatMonthKey(key: string): string {
    const date = this.parseMonthKey(key);
    return MONTH_LABEL_FORMAT.format(date);
  }

  private formatDate(isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return new Intl.DateTimeFormat('en-US', { month: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(date);
  }
}
