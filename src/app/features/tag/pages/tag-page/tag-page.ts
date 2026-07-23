import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { formatBrl } from '@shared/utils/currency';
import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { WalletService } from '@features/wallet/services/wallet.service';
import { TagAccumulationService } from '@features/tag/services/tag-accumulation.service';
import { TagAccumulationOrigin } from '@features/tag/models/tag-accumulation';

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

/** Exhaustive — a new `TagAccumulationOrigin` member fails to compile here until added. */
const ACCUMULATION_ORIGIN_LABEL: Readonly<Record<TagAccumulationOrigin, string>> = {
  EXPENSE: 'Expense',
  INSTALLMENT: 'Installment',
  SUBSCRIPTION: 'Subscription',
};

interface AccumulationRow {
  readonly tagId: string;
  readonly tagName: string;
  readonly total: number;
  readonly breakdownLabel: string;
  readonly isSubtag: boolean;
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

    const toRow = (entry: (typeof result.entries)[number]): AccumulationRow => ({
      tagId: entry.tagId,
      tagName: entry.tagName,
      total: entry.total,
      breakdownLabel: (Object.entries(entry.breakdown) as [TagAccumulationOrigin, number][])
        .map(([source, amount]) => `${ACCUMULATION_ORIGIN_LABEL[source]}: ${formatBrl(amount)}`)
        .join(' · '),
      isSubtag: entry.parentId !== null,
    });

    // No rollup (backend decision) means a subtag's total is NOT folded into its parent's —
    // grouping root-then-its-subtags here (same order as the Tags view's tagGroups) at least
    // makes that relationship visible, instead of every tag appearing as an unrelated flat row.
    const roots = result.entries.filter((entry) => entry.parentId === null);
    const subtagsByParent = new Map<string, typeof result.entries>();
    for (const entry of result.entries) {
      if (entry.parentId === null) continue;
      const siblings = subtagsByParent.get(entry.parentId) ?? [];
      subtagsByParent.set(entry.parentId, [...siblings, entry]);
    }
    const orphanSubtags = result.entries.filter(
      (entry) => entry.parentId !== null && !roots.some((root) => root.tagId === entry.parentId),
    );

    return [
      ...roots.flatMap((root) => [toRow(root), ...(subtagsByParent.get(root.tagId) ?? []).map(toRow)]),
      // A subtag can accumulate without its parent tag ever having its own entry (parent has
      // zero contributions across Expense/Installment/Subscription) — still show it.
      ...orphanSubtags.map(toRow),
    ];
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

    // Flips `accumulationVisited` false→true on first visit — the constructor `effect()`
    // is the single owner of the actual load, triggered by this signal change. Do NOT also
    // call loadByWalletId() here: it reads accumulationVisited() too, so calling both would
    // fire the request twice on first visit (verified via a failing call-count assertion in
    // tag-page.spec.ts before this fix). `signal.set()` with the same value is a no-op, so
    // repeat visits to the tab correctly don't refire.
    if (mode === 'accumulation') this.accumulationVisited.set(true);
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
