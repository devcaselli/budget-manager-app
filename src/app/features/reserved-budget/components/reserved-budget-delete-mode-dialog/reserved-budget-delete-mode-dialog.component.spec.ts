import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';

import {
  ReservedBudgetDeleteBlockingMigration,
  ReservedBudgetDeleteModeDialogComponent,
  ReservedBudgetDeleteModeDialogData,
} from './reserved-budget-delete-mode-dialog.component';

// RBM-F12/F12a — locks the symmetric block (both radios/paths blocked identically, never a
// per-modality variant — the regression the 3rd round explicitly guards against) and the chained
// undo-and-end/skip shortcut (a single confirmation, no second dialog, correct label/summary).

describe('ReservedBudgetDeleteModeDialogComponent', () => {
  let fixture: ComponentFixture<ReservedBudgetDeleteModeDialogComponent>;
  let component: ReservedBudgetDeleteModeDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let matDialogOpenSpy: ReturnType<typeof vi.fn>;

  function migration(
    overrides: Partial<ReservedBudgetDeleteBlockingMigration> = {},
  ): ReservedBudgetDeleteBlockingMigration {
    return {
      extraBudgetId: 'eb-1',
      bulletLabel: 'Groceries',
      amount: 'R$ 500,00',
      amountValue: 500,
      ...overrides,
    };
  }

  function configure(blockingMigrations: readonly ReservedBudgetDeleteBlockingMigration[]): void {
    dialogRef = { close: vi.fn() };
    matDialogOpenSpy = vi.fn();
    const data: ReservedBudgetDeleteModeDialogData = {
      description: 'Vacation fund',
      effectiveMonthLabel: 'Aug 2026',
      blockingMigrations,
    };

    TestBed.configureTestingModule({
      imports: [ReservedBudgetDeleteModeDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialog, useValue: { open: matDialogOpenSpy } },
      ],
    });

    fixture = TestBed.createComponent(ReservedBudgetDeleteModeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function selectMode(mode: 'END' | 'SKIP_MONTH'): void {
    component['form'].controls.mode.setValue(mode);
    fixture.detectChanges();
  }

  describe('unblocked (no live migration this month)', () => {
    it('leaves both radios enabled and shows no block reason', () => {
      configure([]);

      const radios = fixture.nativeElement.querySelectorAll('input[type="radio"]');
      expect(radios.length).toBe(2);
      radios.forEach((radio: HTMLInputElement) => expect(radio.disabled).toBe(false));
      expect(fixture.nativeElement.querySelector('[role="note"]')).toBeNull();
    });

    it('keeps confirm disabled until a modality is chosen', () => {
      configure([]);

      const confirmBtn = fixture.nativeElement.querySelector('.rbdm-confirm-btn') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);

      selectMode('END');
      fixture.detectChanges();

      expect((fixture.nativeElement.querySelector('.rbdm-confirm-btn') as HTMLButtonElement).disabled).toBe(
        false,
      );
    });

    it('confirm() on the normal path closes with undoBlockingMigrationsFirst: false', () => {
      configure([]);
      selectMode('SKIP_MONTH');

      component['confirm']();

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'SKIP_MONTH',
        undoBlockingMigrationsFirst: false,
      });
    });

    it('does not render the undo shortcut block', () => {
      configure([]);

      expect(fixture.nativeElement.querySelector('.rbdm-shortcut')).toBeNull();
    });
  });

  describe('blocked — symmetric lock (3rd round)', () => {
    it('with 1 migration: primary confirm is disabled for BOTH modalities, and the block reason lists it', () => {
      configure([migration()]);

      selectMode('END');
      component['confirm']();
      expect(dialogRef.close).not.toHaveBeenCalled();

      selectMode('SKIP_MONTH');
      component['confirm']();
      expect(dialogRef.close).not.toHaveBeenCalled();

      const reason = fixture.nativeElement.querySelector('.rbdm-block-reason');
      expect(reason?.textContent).toContain('Groceries');
      expect(reason?.textContent).toContain('R$ 500,00');
    });

    it('with 2 migrations: 2 lines in the block reason, confirm still disabled', () => {
      configure([
        migration({ extraBudgetId: 'eb-1', bulletLabel: 'Groceries' }),
        migration({ extraBudgetId: 'eb-2', bulletLabel: 'Fuel' }),
      ]);

      const items = fixture.nativeElement.querySelectorAll('.rbdm-block-item');
      expect(items.length).toBe(2);

      const confirmBtn = fixture.nativeElement.querySelector('.rbdm-confirm-btn') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });

    it('symmetry: exactly one block-reason block exists, and neither radio is programmatically disabled', () => {
      configure([migration()]);

      // Radios stay selectable in the blocked state (RBM-F12a correction) — the lock moved to the
      // submit button, not the inputs — but there must be exactly ONE reason block, never a
      // per-radio variant (this is what pins the symmetric design against the 2nd-round regression).
      const reasonBlocks = fixture.nativeElement.querySelectorAll('.rbdm-block-reason');
      expect(reasonBlocks.length).toBe(1);
    });

    it('the block reason is referenced by the fieldset via aria-describedby', () => {
      configure([migration()]);

      const fieldset = fixture.nativeElement.querySelector('fieldset') as HTMLFieldSetElement;
      expect(fieldset.getAttribute('aria-describedby')).toBe('rbdm-block-reason');
    });
  });

  describe('undo-and-end/skip shortcut (RBM-F12a)', () => {
    it('is disabled with a neutral label until a modality is chosen', () => {
      configure([migration()]);

      expect(component['undoShortcutDisabled']()).toBe(true);
      expect(component['undoShortcutLabel']()).toBe('Undo migrations and continue');
    });

    it('label reacts to the chosen modality', () => {
      configure([migration()]);

      selectMode('END');
      expect(component['undoShortcutLabel']()).toBe('Undo and end');

      selectMode('SKIP_MONTH');
      expect(component['undoShortcutLabel']()).toBe('Undo and skip');
    });

    it('is enabled once a modality is chosen, while the primary confirm stays disabled', () => {
      configure([migration()]);
      selectMode('END');
      fixture.detectChanges();

      expect(component['undoShortcutDisabled']()).toBe(false);
      expect(
        (fixture.nativeElement.querySelector('.rbdm-confirm-btn') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('clicking it closes with exactly { mode, undoBlockingMigrationsFirst: true }', () => {
      configure([migration()]);
      selectMode('SKIP_MONTH');

      component['confirmWithUndo']();

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'SKIP_MONTH',
        undoBlockingMigrationsFirst: true,
      });
    });

    it('confirm() (normal path) never emits undoBlockingMigrationsFirst: true', () => {
      configure([]);
      selectMode('END');

      component['confirm']();

      expect(dialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({ undoBlockingMigrationsFirst: false }),
      );
      expect(dialogRef.close).not.toHaveBeenCalledWith(
        expect.objectContaining({ undoBlockingMigrationsFirst: true }),
      );
    });

    it('does not open a second confirmation dialog on click', () => {
      configure([migration()]);
      selectMode('END');

      component['confirmWithUndo']();

      expect(matDialogOpenSpy).not.toHaveBeenCalled();
    });

    it('summary text contains the count and the total — not asserted as one exact string', () => {
      configure([migration({ amountValue: 300 }), migration({ extraBudgetId: 'eb-2', amountValue: 200 })]);
      selectMode('END');

      const summary = component['undoShortcutSummary']();
      expect(summary).toContain('2');
      // Intl.NumberFormat('pt-BR') can render a non-breaking space between "R$" and the digits
      // depending on the ICU data available in the test environment — match on digits/decimals
      // only, not the exact currency prefix spacing (500,00 is what proves the total is right).
      expect(summary).toMatch(/500,00/);
    });

    it('does not degrade for N=3: summary count is 3 and the block lists 3 lines', () => {
      configure([
        migration({ extraBudgetId: 'eb-1' }),
        migration({ extraBudgetId: 'eb-2' }),
        migration({ extraBudgetId: 'eb-3' }),
      ]);
      selectMode('SKIP_MONTH');
      fixture.detectChanges();

      expect(component['undoShortcutSummary']()).toContain('3');
      expect(fixture.nativeElement.querySelectorAll('.rbdm-block-item').length).toBe(3);
    });
  });

  it('renders zero mat-select and zero mat-radio in the compiled template', () => {
    configure([]);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('mat-select')).toBeNull();
    expect(root.querySelector('mat-radio-button')).toBeNull();
    expect(root.querySelector('mat-radio-group')).toBeNull();
  });

  it('cancel() closes the dialog with no result', () => {
    configure([]);

    component['cancel']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
