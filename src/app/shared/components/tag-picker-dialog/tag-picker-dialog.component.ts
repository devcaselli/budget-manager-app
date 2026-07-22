import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
