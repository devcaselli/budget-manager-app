import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { Tag } from '../../models/tag';

export interface TagFormDialogData {
  /** Present when editing; absent when creating. */
  readonly tag?: Tag;
  /** Root tags only — a subtag can never be offered as a parent (backend enforces 1 level). */
  readonly rootTags: readonly Tag[];
}

export interface TagFormDialogResult {
  readonly name: string;
  readonly parentId: string | null;
}

/** Rejects empty-after-trim names — `Validators.required` alone lets "   " through. */
function notBlankValidator(control: { value: string }): ValidationErrors | null {
  return control.value.trim().length === 0 ? { blank: true } : null;
}

@Component({
  selector: 'app-tag-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './tag-form-dialog.component.html',
  styleUrl: './tag-form-dialog.component.scss',
})
export class TagFormDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<TagFormDialogComponent, TagFormDialogResult>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<TagFormDialogData>(MAT_DIALOG_DATA);
  protected readonly isEditing = !!this.data.tag;

  /** A tag can't be its own parent when editing. */
  protected readonly parentOptions = this.data.rootTags.filter(
    (root) => root.id !== this.data.tag?.id,
  );

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [
      this.data.tag?.name ?? '',
      [Validators.required, Validators.maxLength(100), notBlankValidator],
    ],
    parentId: [this.data.tag?.parentId ?? ''],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const result: TagFormDialogResult = {
      name: value.name.trim(),
      parentId: value.parentId.trim() || null,
    };

    this.dialogRef.close(result);
  }
}
