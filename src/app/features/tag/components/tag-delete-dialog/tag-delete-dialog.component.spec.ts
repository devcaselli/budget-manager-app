import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import {
  TagDeleteDialogComponent,
  TagDeleteDialogData,
} from './tag-delete-dialog.component';

describe('TagDeleteDialogComponent', () => {
  let fixture: ComponentFixture<TagDeleteDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn<(result?: boolean) => void>> };

  function setup(data: TagDeleteDialogData): void {
    dialogRef = { close: vi.fn<(result?: boolean) => void>() };

    TestBed.configureTestingModule({
      imports: [TagDeleteDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(TagDeleteDialogComponent);
    fixture.detectChanges();
  }

  it('closes with true on confirm', () => {
    setup({ name: 'Travel', subtagCount: 0 });

    const confirmBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '.tdd-delete-btn',
    ) as HTMLButtonElement;
    confirmBtn.click();

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with false on cancel', () => {
    setup({ name: 'Travel', subtagCount: 0 });

    const cancelBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '.tdd-close',
    ) as HTMLButtonElement;
    cancelBtn.click();

    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('shows the subtag cascade warning when subtagCount > 0', () => {
    setup({ name: 'Travel', subtagCount: 2 });

    const message = (fixture.nativeElement as HTMLElement).querySelector('.tdd-message')!.textContent!;
    expect(message).toContain('2 subtags');
  });

  it('omits the cascade warning when subtagCount is 0', () => {
    setup({ name: 'Travel', subtagCount: 0 });

    const message = (fixture.nativeElement as HTMLElement).querySelector('.tdd-message')!.textContent!;
    expect(message).not.toContain('subtag');
  });
});
