import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { ViewerDiscardConfirmDialogComponent } from './viewer-discard-confirm-dialog.component';

describe('ViewerDiscardConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ViewerDiscardConfirmDialogComponent>;
  let component: ViewerDiscardConfirmDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [ViewerDiscardConfirmDialogComponent],
      providers: [{ provide: MatDialogRef, useValue: dialogRef }],
    });

    fixture = TestBed.createComponent(ViewerDiscardConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
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
    root.querySelector<HTMLButtonElement>('.vdc-discard-btn')?.click();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });
});
