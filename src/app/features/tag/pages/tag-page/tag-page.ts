import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { formatBrl } from '@shared/utils/currency';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { WalletService } from '@features/wallet/services/wallet.service';
import { TagAccumulationService } from '@features/tag/services/tag-accumulation.service';

import {
  TagDeleteDialogComponent,
  TagDeleteDialogData,
} from '../../components/tag-delete-dialog/tag-delete-dialog.component';
import {
  TagFormDialogComponent,
  TagFormDialogData,
  TagFormDialogResult,
} from '../../components/tag-form-dialog/tag-form-dialog.component';
import { Tag } from '../../models/tag';
import { TagService } from '../../services/tag.service';
import { groupTagsByParent } from '../../utils/group-tags-by-parent';

type TagViewMode = 'tags' | 'accumulation';

interface AccumulationRow {
  readonly tagId: string;
  readonly tagName: string;
  readonly total: number;
  readonly breakdownLabel: string;
}

@Component({
  selector: 'app-tag-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlCurrencyPipe, MatIconModule],
  templateUrl: './tag-page.html',
  styleUrl: './tag-page.scss',
})
export class TagPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly tagService = inject(TagService);
  private readonly walletService = inject(WalletService);
  private readonly tagAccumulationService = inject(TagAccumulationService);

  private readonly selectedWallet = toSignal(this.walletService.selectedWallet$, {
    initialValue: null,
  });
  private readonly accumulation = toSignal(this.tagAccumulationService.accumulation$, {
    initialValue: null,
  });
  private readonly accumulationVisited = signal(false);

  protected readonly tags = toSignal(this.tagService.tags$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.tagService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.tagService.saving$, { initialValue: false });
  protected readonly deletingId = toSignal(this.tagService.deleting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.tagService.error$, { initialValue: null });
  protected readonly viewMode = signal<TagViewMode>('tags');
  protected readonly isAccumulationLoading = toSignal(this.tagAccumulationService.loading$, {
    initialValue: false,
  });
  protected readonly accumulationErrorMessage = toSignal(this.tagAccumulationService.error$, {
    initialValue: null,
  });

  protected readonly totalCount = computed(() => this.tags().length);
  protected readonly tagGroups = computed(() => groupTagsByParent(this.tags()));
  protected readonly rootTags = computed(() => this.tags().filter((t) => t.parentId === null));

  protected readonly accumulationRows = computed<readonly AccumulationRow[]>(() => {
    const result = this.accumulation();
    if (!result) return [];

    return result.entries.map((entry) => ({
      tagId: entry.tagId,
      tagName: entry.tagName,
      total: entry.total,
      breakdownLabel: Object.entries(entry.breakdown)
        .map(([source, amount]) => `${this.breakdownSourceLabel(source)}: ${formatBrl(amount)}`)
        .join(' · '),
    }));
  });

  constructor() {
    effect(() => {
      const walletId = this.selectedWallet()?.id ?? null;
      // Reload accumulation on wallet change only if the tab was already opened once —
      // avoid firing the request in the background before the user ever looks at it.
      if (walletId && this.accumulationVisited()) {
        this.tagAccumulationService.loadByWalletId(walletId);
      }
    });

    this.tagService.loadAll();
  }

  protected setViewMode(mode: TagViewMode): void {
    this.viewMode.set(mode);

    if (mode === 'accumulation' && !this.accumulationVisited()) {
      this.accumulationVisited.set(true);
      const walletId = this.selectedWallet()?.id;
      if (walletId) this.tagAccumulationService.loadByWalletId(walletId);
    }
  }

  private breakdownSourceLabel(source: string): string {
    switch (source) {
      case 'EXPENSE':
        return 'Expense';
      case 'INSTALLMENT':
        return 'Installment';
      case 'SUBSCRIPTION':
        return 'Subscription';
      default:
        return source;
    }
  }

  protected onNewClick(): void {
    this.openFormDialog({ rootTags: this.rootTags() });
  }

  protected onEditClick(tag: Tag): void {
    this.openFormDialog({ tag, rootTags: this.rootTags() });
  }

  protected onDeleteClick(tag: Tag): void {
    const subtagCount = this.tagGroups().find((g) => g.root.id === tag.id)?.subtags.length ?? 0;
    const data: TagDeleteDialogData = { name: tag.name, subtagCount };

    this.dialog
      .open<TagDeleteDialogComponent, TagDeleteDialogData, boolean>(TagDeleteDialogComponent, {
        width: '28rem',
        maxWidth: 'calc(100vw - 2rem)',
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.tagService.delete(tag.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            error: () => undefined,
          });
        }
      });
  }

  private openFormDialog(data: TagFormDialogData): void {
    this.dialog
      .open<TagFormDialogComponent, TagFormDialogData, TagFormDialogResult>(
        TagFormDialogComponent,
        { width: '30rem', maxWidth: 'calc(100vw - 2rem)', data },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (!result) return;

        const request = { name: result.name, parentId: result.parentId };
        const save$ = data.tag
          ? this.tagService.update(data.tag.id, request)
          : this.tagService.create(request);

        save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
      });
  }
}
