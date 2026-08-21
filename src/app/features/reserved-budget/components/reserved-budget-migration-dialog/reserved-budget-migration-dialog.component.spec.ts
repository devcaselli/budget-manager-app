import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import {
  ReservedBudgetMigrationDialogComponent,
  ReservedBudgetMigrationDialogData,
} from './reserved-budget-migration-dialog.component';

// RBM-F10 — locks the dialog's real-money cap check (decision #3), including the boundary. The
// primary assertion in each case is the computed()'s value, not the DOM — a single DOM case at
// the end proves the wiring. `>` (not `>=`) is the easiest mistake here, so case #3 pins the
// boundary explicitly.

describe('ReservedBudgetMigrationDialogComponent', () => {
  let fixture: ComponentFixture<ReservedBudgetMigrationDialogComponent>;
  let component: ReservedBudgetMigrationDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function configure(availableValue: number): void {
    dialogRef = { close: vi.fn() };
    const data: ReservedBudgetMigrationDialogData = {
      reservedBudgetDescription: 'Vacation',
      availableValue,
      availableLabel: `R$ ${availableValue.toFixed(2)}`,
      currency: 'BRL',
      effectiveMonthLabel: 'Aug 2026',
      bullets: [
        { id: 'bullet-1', description: 'Groceries', remaining: 'R$ 100.00' },
        { id: 'bullet-2', description: 'Fuel', remaining: 'R$ 50.00' },
      ],
    };

    TestBed.configureTestingModule({
      imports: [ReservedBudgetMigrationDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(ReservedBudgetMigrationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function setAmount(value: number): void {
    component['form'].controls.amount.setValue(value);
    fixture.detectChanges();
  }

  function setBullet(id: string): void {
    component['form'].controls.bulletId.setValue(id);
  }

  it('starts with exceedsAvailable() false, proving the toSignal initialValue is correct', () => {
    configure(500);

    expect(component['exceedsAvailable']()).toBe(false);
  });

  it('setValue(available + 0.01) flips exceedsAvailable() to true without any submit', () => {
    configure(500);

    setAmount(500.01);

    expect(component['exceedsAvailable']()).toBe(true);
  });

  it('setValue(available) — exactly the cap — stays false (inclusive boundary)', () => {
    configure(500);

    setAmount(500);

    expect(component['exceedsAvailable']()).toBe(false);
  });

  it('setValue(available - 1) stays false and remainingAfter is exact', () => {
    configure(500);

    setAmount(499);

    expect(component['exceedsAvailable']()).toBe(false);
    expect(component['remainingAfterValue']()).toBe(1);
  });

  it('going from an invalid amount back to a valid one clears the exceeded state', () => {
    configure(500);

    setAmount(600);
    expect(component['exceedsAvailable']()).toBe(true);

    setAmount(400);
    expect(component['exceedsAvailable']()).toBe(false);
  });

  it('confirm() above the cap does not close the dialog with a result', () => {
    configure(500);
    setBullet('bullet-1');
    setAmount(600);

    component['confirm']();

    expect(dialogRef.close).not.toHaveBeenCalledWith(expect.objectContaining({ amount: 600 }));
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('confirm() with a valid amount closes with the exact bulletId and amount', () => {
    configure(500);
    setBullet('bullet-2');
    setAmount(250);

    component['confirm']();

    expect(dialogRef.close).toHaveBeenCalledWith({ bulletId: 'bullet-2', amount: 250 });
  });

  it('availableValue === 0 means any amount above 0 exceeds the cap', () => {
    configure(0);

    setAmount(0.01);

    expect(component['exceedsAvailable']()).toBe(true);
  });

  it('renders the error message in the DOM once the amount exceeds the cap', () => {
    configure(500);

    setAmount(600);

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Amount exceeds the available balance.');
  });

  it('renders a native select with no mat-select in the compiled template', () => {
    configure(500);

    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector('select.ew-select');

    expect(select).toBeTruthy();
    expect(select?.querySelectorAll('option').length).toBe(3); // placeholder + 2 bullets
    expect(root.querySelector('mat-select')).toBeNull();
  });
});
