import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Tag } from '../../models/tag';
import {
  TagFormDialogComponent,
  TagFormDialogData,
  TagFormDialogResult,
} from './tag-form-dialog.component';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 'tag-1', name: 'Travel', parentId: null, ...overrides };
}

describe('TagFormDialogComponent', () => {
  let fixture: ComponentFixture<TagFormDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn<(result?: TagFormDialogResult) => void>> };

  function setup(data: TagFormDialogData): void {
    dialogRef = { close: vi.fn<(result?: TagFormDialogResult) => void>() };

    TestBed.configureTestingModule({
      imports: [TagFormDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(TagFormDialogComponent);
    fixture.detectChanges();
  }

  function nameInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#tfd-name') as HTMLInputElement;
  }

  function parentSelect(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('#tfd-parent') as HTMLSelectElement;
  }

  function setName(value: string): void {
    const input = nameInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function setParent(value: string): void {
    const select = parentSelect();
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function submitForm(): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function errorMessage(): string | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.tfd-error')?.textContent ?? null;
  }

  describe('create mode', () => {
    beforeEach(() => setup({ rootTags: [makeTag({ id: 'root-1', name: 'Travel' })] }));

    it('starts with an empty name and no parent selected', () => {
      expect(nameInput().value).toBe('');
      expect(parentSelect().value).toBe('');
    });

    it('blocks submit and shows a validation error when name is empty', () => {
      submitForm();

      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(errorMessage()).toContain('Enter a name');
    });

    it('blocks submit when name is whitespace-only', () => {
      setName('   ');
      submitForm();

      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(errorMessage()).toContain('Enter a name');
    });

    it('closes with the trimmed name and parentId null when no parent is selected', () => {
      setName('  Groceries  ');
      submitForm();

      expect(dialogRef.close).toHaveBeenCalledWith({ name: 'Groceries', parentId: null });
    });

    it('closes with the selected parentId when a parent is chosen', () => {
      setName('Uber');
      setParent('root-1');
      submitForm();

      expect(dialogRef.close).toHaveBeenCalledWith({ name: 'Uber', parentId: 'root-1' });
    });

    it('offers all root tags as parent options', () => {
      const options = Array.from(parentSelect().querySelectorAll('option')).map((o) => o.value);
      expect(options).toEqual(['', 'root-1']);
    });
  });

  describe('edit mode', () => {
    const editingTag = makeTag({ id: 'root-1', name: 'Travel', parentId: null });
    const otherRoot = makeTag({ id: 'root-2', name: 'Food' });

    beforeEach(() => setup({ tag: editingTag, rootTags: [editingTag, otherRoot] }));

    it('pre-fills the form from the tag being edited', () => {
      expect(nameInput().value).toBe('Travel');
      expect(parentSelect().value).toBe('');
    });

    it('excludes the tag itself from parent options (a tag cannot be its own parent)', () => {
      const options = Array.from(parentSelect().querySelectorAll('option')).map((o) => o.value);
      expect(options).toEqual(['', 'root-2']);
    });

    it('closes with updated values on valid submit', () => {
      setName('Trips');
      submitForm();

      expect(dialogRef.close).toHaveBeenCalledWith({ name: 'Trips', parentId: null });
    });

    it('renders "Edit" as the dialog mode title cue', () => {
      const title = (fixture.nativeElement as HTMLElement).querySelector('.tfd-title')!.textContent!;
      expect(title).toContain('Edit');
    });
  });
});
