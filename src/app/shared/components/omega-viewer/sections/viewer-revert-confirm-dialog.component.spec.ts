import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import {
  ViewerRevertConfirmDialogComponent,
  ViewerRevertConfirmDialogData,
} from './viewer-revert-confirm-dialog.component';

describe('ViewerRevertConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ViewerRevertConfirmDialogComponent>;
  let component: ViewerRevertConfirmDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dialogRef = { close: vi.fn() };
    const data: ViewerRevertConfirmDialogData = { dateLabel: '29/04/2026' };

    TestBed.configureTestingModule({
      imports: [ViewerRevertConfirmDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(ViewerRevertConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the injected payment date in the message', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('29/04/2026');
  });

  it('closes with true on confirm', () => {
    component['confirm']();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with false on cancel', () => {
    component['cancel']();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('confirm button click closes with true', () => {
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vrc-confirm-btn')?.click();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });
});
