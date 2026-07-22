import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

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

@Component({
  selector: 'app-tag-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './tag-page.html',
  styleUrl: './tag-page.scss',
})
export class TagPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly tagService = inject(TagService);

  protected readonly tags = toSignal(this.tagService.tags$, { initialValue: [] });
  protected readonly isLoading = toSignal(this.tagService.loading$, { initialValue: false });
  protected readonly isSaving = toSignal(this.tagService.saving$, { initialValue: false });
  protected readonly deletingId = toSignal(this.tagService.deleting$, { initialValue: null });
  protected readonly errorMessage = toSignal(this.tagService.error$, { initialValue: null });

  protected readonly totalCount = computed(() => this.tags().length);
  protected readonly tagGroups = computed(() => groupTagsByParent(this.tags()));
  protected readonly rootTags = computed(() => this.tags().filter((t) => t.parentId === null));

  constructor() {
    this.tagService.loadAll();
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
