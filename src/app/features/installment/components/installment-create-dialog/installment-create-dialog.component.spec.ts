import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Tag } from '@features/tag/models/tag';
import { TagService } from '@features/tag/services/tag.service';

import {
  InstallmentCreateDialogComponent,
  InstallmentCreateDialogData,
  InstallmentCreateDialogResult,
} from './installment-create-dialog.component';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 'tag-1', name: 'Travel', parentId: null, ...overrides };
}

describe('InstallmentCreateDialogComponent — tag selection', () => {
  let fixture: ComponentFixture<InstallmentCreateDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn<(result?: InstallmentCreateDialogResult) => void>> };
  let matDialogOpenSpy: ReturnType<typeof vi.spyOn>;
  let pickerAfterClosed$: ReturnType<typeof vi.fn>;

  const data: InstallmentCreateDialogData = {
    creditCards: [{ id: 'card-1', name: 'Nubank' }],
  };

  beforeEach(() => {
    dialogRef = { close: vi.fn<(result?: InstallmentCreateDialogResult) => void>() };
    pickerAfterClosed$ = vi.fn();

    TestBed.configureTestingModule({
      imports: [InstallmentCreateDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: TagService,
          useValue: {
            loadAll: vi.fn(),
            tags$: of([makeTag(), makeTag({ id: 'tag-2', name: 'Uber', parentId: 'tag-1' })]),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(InstallmentCreateDialogComponent);
    const dialog = fixture.debugElement.injector.get(MatDialog);
    matDialogOpenSpy = vi
      .spyOn(dialog, 'open')
      .mockReturnValue({ afterClosed: pickerAfterClosed$ } as never);
    fixture.detectChanges();
  });

  function el<T extends HTMLElement>(selector: string): T {
    return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
  }

  function setInput(selector: string, value: string): void {
    const input = el<HTMLInputElement | HTMLSelectElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function fillRequiredFields(): void {
    setInput('#icd-description', 'Notebook');
    setInput('#icd-amount', '100');
    setInput('#icd-currency', 'BRL');
    setInput('#icd-charges', '10');
    setInput('#icd-date', '2026-01-01');
    setInput('#icd-effective-month', '2026-01');
    setInput('#icd-card', 'card-1');
  }

  function submitForm(): void {
    const form = el<HTMLFormElement>('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function clickTagsButton(): void {
    const btn = el<HTMLButtonElement>('.icd-tags-btn');
    if (!btn) throw new Error('tags button not found in DOM');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  it('submits with an empty tagIds array when no tags were picked', () => {
    fillRequiredFields();
    submitForm();

    expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ tagIds: [] }));
  });

  it('opens the shared TagPickerDialogComponent with the loaded tags and current selection', () => {
    pickerAfterClosed$.mockReturnValue(of(undefined));

    clickTagsButton();

    expect(matDialogOpenSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: {
          availableTags: [makeTag(), makeTag({ id: 'tag-2', name: 'Uber', parentId: 'tag-1' })],
          selectedTagIds: [],
        },
      }),
    );
  });

  it('does not render tag chips when the picker is cancelled (undefined result)', () => {
    pickerAfterClosed$.mockReturnValue(of(undefined));

    clickTagsButton();

    expect(el('.icd-tag-chips')).toBeNull();
  });

  it('renders chips for the picked tags and includes them in the submitted result', () => {
    pickerAfterClosed$.mockReturnValue(of(['tag-1', 'tag-2']));

    clickTagsButton();
    fixture.detectChanges();

    const chipTexts = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.icd-tag-chip'),
    ).map((c) => c.textContent!.trim());
    expect(chipTexts).toEqual(['Travel', 'Uber']);

    fillRequiredFields();
    submitForm();

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: ['tag-1', 'tag-2'] }),
    );
  });

  it('clears the tag selection when "keep open" resets the form for the next entry', () => {
    pickerAfterClosed$.mockReturnValue(of(['tag-1']));
    clickTagsButton();
    expect(el('.icd-tag-chips')).toBeTruthy();

    setInput('#icd-charges', '2'); // keep other defaults, just touch the form
    fillRequiredFields();
    (el<HTMLButtonElement>('.ew-checkbox')).click(); // toggle "keep modal open"
    submitForm();

    expect(el('.icd-tag-chips')).toBeNull();
  });
});
