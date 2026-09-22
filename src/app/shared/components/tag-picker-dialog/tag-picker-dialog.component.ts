import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { Tag } from '@features/tag/models/tag';
import { groupTagsByParent } from '@features/tag/utils/group-tags-by-parent';

export interface TagPickerDialogData {
  readonly availableTags: readonly Tag[];
  readonly selectedTagIds: readonly string[];
}

/** Result is the confirmed tag id selection; `undefined` means the user cancelled. */
export type TagPickerDialogResult = readonly string[] | undefined;

/** Flattened row for template rendering — a root tag or one of its subtags, in display order. */
interface TagPickerRow {
  readonly tag: Tag;
  readonly isSubtag: boolean;
  readonly controlIndex: number;
}

@Component({
  selector: 'app-tag-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './tag-picker-dialog.component.html',
  styleUrl: './tag-picker-dialog.component.scss',
})
export class TagPickerDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<TagPickerDialogComponent, TagPickerDialogResult>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<TagPickerDialogData>(MAT_DIALOG_DATA);

  /** Display order: each root tag immediately followed by its subtags. */
  protected readonly rows: readonly TagPickerRow[] = groupTagsByParent(this.data.availableTags).flatMap(
    (group) => [
      { tag: group.root, isSubtag: false },
      ...group.subtags.map((subtag) => ({ tag: subtag, isSubtag: true })),
    ],
  ).map((row, controlIndex) => ({ ...row, controlIndex }));

  protected readonly selection: FormArray<FormControl<boolean>> = this.formBuilder.array(
    this.rows.map((row) =>
      this.formBuilder.nonNullable.control(this.data.selectedTagIds.includes(row.tag.id)),
    ),
  );

  /** D11: the design's tags modal opens with a "Search tag" field above the list. */
  protected readonly query = signal('');

  /**
   * D11: rows narrowed by the search box.
   *
   * Filtering is display-only — it never touches `selection`. Each row keeps its original
   * `controlIndex`, so a row that scrolls out of the filter keeps its checked state and is
   * still counted by `confirm()` (which iterates `rows`, not `visibleRows`). Typing in the
   * box therefore cannot silently drop a selection the user already made — the bug this
   * would invite if the FormArray were rebuilt per keystroke.
   *
   * A subtag match also pulls in its parent row, so a filtered result never renders an
   * indented orphan with no visible parent (the 2-level hierarchy from P3-B3 stays legible).
   *
   * O(n) per keystroke over the tag list (n = 16 here); no sorting, no nested scans.
   */
  protected readonly visibleRows = computed<readonly TagPickerRow[]>(() => {
    const term = this.query().trim().toLowerCase();
    if (term === '') {
      return this.rows;
    }

    const matched = this.rows.filter((row) => row.tag.name.toLowerCase().includes(term));
    const keptIds = new Set(matched.map((row) => row.tag.id));

    // Pull in the parent of any matched subtag, so indentation always has its anchor.
    for (const row of matched) {
      if (row.tag.parentId !== null) {
        keptIds.add(row.tag.parentId);
      }
    }

    return this.rows.filter((row) => keptIds.has(row.tag.id));
  });

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected confirm(): void {
    const selectedIds = this.rows
      .filter((row) => this.selection.at(row.controlIndex).value)
      .map((row) => row.tag.id);

    this.dialogRef.close(selectedIds);
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }
}
