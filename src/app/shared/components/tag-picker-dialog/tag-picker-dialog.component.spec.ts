import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Tag } from '@features/tag/models/tag';

import {
  TagPickerDialogComponent,
  TagPickerDialogData,
  TagPickerDialogResult,
} from './tag-picker-dialog.component';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 'tag-1', name: 'Travel', parentId: null, ...overrides };
}

describe('TagPickerDialogComponent', () => {
  let fixture: ComponentFixture<TagPickerDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn<(result?: TagPickerDialogResult) => void>> };

  function setup(data: TagPickerDialogData): void {
    dialogRef = { close: vi.fn<(result?: TagPickerDialogResult) => void>() };

    TestBed.configureTestingModule({
      imports: [TagPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(TagPickerDialogComponent);
    fixture.detectChanges();
  }

  function checkboxes(): HTMLInputElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="checkbox"]'),
    );
  }

  function rowLabels(): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.tpd-checkbox-label'),
    ).map((el) => el.textContent!.trim());
  }

  it('renders root tags followed by their subtags, in order', () => {
    const root = makeTag({ id: 'root-1', name: 'Travel' });
    const subtag = makeTag({ id: 'sub-1', name: 'Uber', parentId: 'root-1' });
    const otherRoot = makeTag({ id: 'root-2', name: 'Food' });
    setup({ availableTags: [root, subtag, otherRoot], selectedTagIds: [] });

    // Post-epic-audit P3-B1: hierarchy is now conveyed visually (indentation +
    // color/weight via .tpd-checkbox-label--subtag), not a "— " text prefix.
    expect(rowLabels()).toEqual(['Travel', 'Uber', 'Food']);
  });

  it('applies the subtag indentation/label styling only to rows with a parent', () => {
    const root = makeTag({ id: 'root-1', name: 'Travel' });
    const subtag = makeTag({ id: 'sub-1', name: 'Uber', parentId: 'root-1' });
    setup({ availableTags: [root, subtag], selectedTagIds: [] });

    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll('.tpd-checkbox-label');
    expect(labels[0]!.classList.contains('tpd-checkbox-label--subtag')).toBe(false);
    expect(labels[1]!.classList.contains('tpd-checkbox-label--subtag')).toBe(true);
  });

  it('pre-checks the checkboxes for already-selected tags', () => {
    const root = makeTag({ id: 'root-1', name: 'Travel' });
    const subtag = makeTag({ id: 'sub-1', name: 'Uber', parentId: 'root-1' });
    setup({ availableTags: [root, subtag], selectedTagIds: ['sub-1'] });

    const boxes = checkboxes();
    expect(boxes[0]!.checked).toBe(false);
    expect(boxes[1]!.checked).toBe(true);
  });

  it('confirm() closes with the selected tag ids', () => {
    const root = makeTag({ id: 'root-1', name: 'Travel' });
    const subtag = makeTag({ id: 'sub-1', name: 'Uber', parentId: 'root-1' });
    setup({ availableTags: [root, subtag], selectedTagIds: [] });

    const boxes = checkboxes();
    boxes[1]!.click();
    fixture.detectChanges();

    const confirmBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '.ew-btn--primary',
    ) as HTMLButtonElement;
    confirmBtn.click();

    expect(dialogRef.close).toHaveBeenCalledWith(['sub-1']);
  });

  it('deselecting a pre-checked tag excludes it from the confirmed result', () => {
    const root = makeTag({ id: 'root-1', name: 'Travel' });
    setup({ availableTags: [root], selectedTagIds: ['root-1'] });

    const boxes = checkboxes();
    boxes[0]!.click(); // uncheck
    fixture.detectChanges();

    const confirmBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '.ew-btn--primary',
    ) as HTMLButtonElement;
    confirmBtn.click();

    expect(dialogRef.close).toHaveBeenCalledWith([]);
  });

  it('cancel() closes with undefined and does not report a selection', () => {
    setup({ availableTags: [makeTag()], selectedTagIds: ['tag-1'] });

    const cancelBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '.ew-btn--ghost',
    ) as HTMLButtonElement;
    cancelBtn.click();

    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });

  it('shows an empty state when there are no tags', () => {
    setup({ availableTags: [], selectedTagIds: [] });

    const empty = (fixture.nativeElement as HTMLElement).querySelector('.ew-empty');
    expect(empty).toBeTruthy();
  });
});
