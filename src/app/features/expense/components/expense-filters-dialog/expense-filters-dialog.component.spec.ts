import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { signal } from '@angular/core';

import { ExpensePaymentStatus, ExpenseSortOrder } from '@features/expense/expense-list.filters';

import {
  ExpenseFiltersDialogComponent,
  ExpenseFiltersDialogData,
} from './expense-filters-dialog.component';

describe('ExpenseFiltersDialogComponent', () => {
  let fixture: ComponentFixture<ExpenseFiltersDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let isGroupedLayout: ReturnType<typeof signal<boolean>>;

  function query<T extends Element = Element>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function buildForm() {
    const formBuilder = new FormBuilder();
    return formBuilder.nonNullable.group({
      search: [''],
      creditCardId: [''],
      sortOrder: ['DATE_DESC' as ExpenseSortOrder],
      paymentStatus: ['ALL' as ExpensePaymentStatus],
      startDate: [''],
      endDate: [''],
      unhidden: [false],
    });
  }

  function setup(): ReturnType<typeof buildForm> {
    dialogRef = { close: vi.fn() };
    isGroupedLayout = signal(false);
    const form = buildForm();

    const data: ExpenseFiltersDialogData = {
      form,
      creditCards: [
        { id: 'card-1', name: 'Itaú' },
        { id: 'card-2', name: 'Nubank' },
      ],
      isGroupedLayout: () => isGroupedLayout(),
    };

    TestBed.configureTestingModule({
      imports: [ExpenseFiltersDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    fixture = TestBed.createComponent(ExpenseFiltersDialogComponent);
    fixture.detectChanges();
    return form;
  }

  it('renders card options and binds sort/date-range/hidden to the passed-in form', () => {
    const form = setup();

    const cardOptions = Array.from(query('#efd-card')?.querySelectorAll('option') ?? []);
    expect(cardOptions.map((o) => o.textContent?.trim())).toEqual(['All cards', 'Itaú', 'Nubank']);

    const startInput = query<HTMLInputElement>('#efd-start')!;
    startInput.value = '2026-01-01';
    startInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(form.controls.startDate.value).toBe('2026-01-01');
  });

  it('disables the value-sort options while the grouped layout is active', () => {
    setup();

    const valueAsc = query('#efd-sort option[value="VALUE_ASC"]') as HTMLOptionElement;
    const valueDesc = query('#efd-sort option[value="VALUE_DESC"]') as HTMLOptionElement;
    expect(valueAsc.disabled).toBe(false);
    expect(valueDesc.disabled).toBe(false);

    isGroupedLayout.set(true);
    fixture.detectChanges();

    expect(valueAsc.disabled).toBe(true);
    expect(valueDesc.disabled).toBe(true);
  });

  it('shows a hint when grouped layout is active and a value sort was already selected', () => {
    const form = setup();

    form.controls.sortOrder.setValue('VALUE_ASC');
    fixture.detectChanges();
    expect(query('.efd-hint')).toBeNull();

    isGroupedLayout.set(true);
    fixture.detectChanges();

    expect(query('.efd-hint')).toBeTruthy();
  });

  it('the hidden-items toggle binds to the form and Done closes the dialog', () => {
    const form = setup();

    const hiddenCheckbox = query<HTMLInputElement>('#efd-unhidden')!;
    hiddenCheckbox.click();
    fixture.detectChanges();
    expect(form.controls.unhidden.value).toBe(true);

    const doneBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Done',
    ) as HTMLButtonElement;
    doneBtn.click();

    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });

  it('P2-4: Cancel closes the dialog too (no staged/draft state to discard — see close() doc)', () => {
    setup();

    const cancelBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancelBtn.click();

    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });
});
