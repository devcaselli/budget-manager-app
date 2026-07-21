import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { InstallmentService, InstallmentFilter } from '../../services/installment.service';
import { Installment, InstallmentSortOrder, PatchInstallmentRequest } from '../../models/installment';
import {
  InstallmentEditDialogComponent,
  InstallmentEditDialogCreditCard,
  InstallmentEditDialogData,
  InstallmentEditDialogResult,
} from '../installment-edit-dialog/installment-edit-dialog.component';

export interface InstallmentFinishedDialogData {
  readonly walletId: string;
  readonly creditCards: readonly InstallmentEditDialogCreditCard[];
}

const PAGE_SIZE = 7;

@Component({
  selector: 'app-installment-finished-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, BrlCurrencyPipe],
  templateUrl: './installment-finished-dialog.component.html',
  styleUrl: './installment-finished-dialog.component.scss',
})
export class InstallmentFinishedDialogComponent {
  private readonly installmentService = inject(InstallmentService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = inject<InstallmentFinishedDialogData>(MAT_DIALOG_DATA);

  protected readonly items = signal<readonly Installment[]>([]);
  protected readonly page = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly totalElements = signal(0);
  protected readonly sort = signal<InstallmentSortOrder>('ENDING_LATE');
  protected readonly loading = signal(false);

  private readonly cardNames = new Map<string, string>(
    this.data.creditCards.map((c) => [c.id, c.name]),
  );

  constructor() {
    this.load(0);
  }

  protected cardName(id: string): string {
    return this.cardNames.get(id) ?? id;
  }

  protected onPrevPage(): void {
    if (this.page() > 0) this.load(this.page() - 1);
  }

  protected onNextPage(): void {
    if (this.page() + 1 < this.totalPages()) this.load(this.page() + 1);
  }

  protected onSortToggle(): void {
    this.sort.set(this.sort() === 'ENDING_LATE' ? 'ENDING_SOON' : 'ENDING_LATE');
    this.load(0);
  }

  protected onEditClick(item: Installment): void {
    const data: InstallmentEditDialogData = {
      id: item.id,
      description: item.description,
      installmentValue: item.installmentValue,
      installmentNumber: item.installmentNumber,
      purchaseDate: item.purchaseDate,
      sourceEffectiveMonth: item.sourceEffectiveMonth,
      creditCardId: item.creditCardId,
      creditCards: this.data.creditCards,
    };

    this.dialog
      .open<InstallmentEditDialogComponent, InstallmentEditDialogData, InstallmentEditDialogResult>(
        InstallmentEditDialogComponent,
        { width: '32rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result != null) this.patch(item.id, result);
      });
  }

  private patch(id: string, result: PatchInstallmentRequest): void {
    this.installmentService
      .patch(id, result)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // patch() updates the active streams, not this modal's local list —
        // reload the current page so the edit is reflected here.
        next: () => this.load(this.page()),
        error: () => undefined,
      });
  }

  private load(page: number): void {
    const filter: InstallmentFilter = {
      creditCardId: null,
      sort: this.sort(),
      page,
      size: PAGE_SIZE,
    };

    this.loading.set(true);
    this.installmentService
      .loadFinished(this.data.walletId, filter)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.content);
          this.page.set(response.page);
          this.totalPages.set(response.totalPages);
          this.totalElements.set(response.totalElements);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
