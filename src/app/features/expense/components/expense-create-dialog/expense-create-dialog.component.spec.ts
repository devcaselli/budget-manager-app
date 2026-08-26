import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { PreferencesService } from '@core/services/preferences.service';

import {
  ExpenseCreateDialogComponent,
  ExpenseCreateDialogData,
} from './expense-create-dialog.component';

describe('ExpenseCreateDialogComponent', () => {
  let fixture: ComponentFixture<ExpenseCreateDialogComponent>;
  let component: ExpenseCreateDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let prefs: {
    rememberCard: ReturnType<typeof vi.fn>;
    rememberedCreditCardId: ReturnType<typeof vi.fn>;
    toggleRememberCard: ReturnType<typeof vi.fn>;
    setRememberedCreditCardId: ReturnType<typeof vi.fn>;
  };

  function query<T extends Element = Element>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function queryAll<T extends Element = Element>(selector: string): T[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector));
  }

  function setup(data: Partial<ExpenseCreateDialogData> = {}): void {
    dialogRef = { close: vi.fn() };
    prefs = {
      rememberCard: vi.fn().mockReturnValue(false),
      rememberedCreditCardId: vi.fn().mockReturnValue(null),
      toggleRememberCard: vi.fn(),
      setRememberedCreditCardId: vi.fn(),
    };

    const dialogData: ExpenseCreateDialogData = {
      walletDescription: 'Wallet',
      walletMonth: 'SEPTEMBER',
      cycle: '2026-09',
      bullets: [],
      creditCards: [{ id: 'card-1', name: 'Itaú' }],
      ...data,
    };

    TestBed.configureTestingModule({
      imports: [ExpenseCreateDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: PreferencesService, useValue: prefs },
      ],
    });

    fixture = TestBed.createComponent(ExpenseCreateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('derives the subtitle from data.walletMonth and data.cycle', () => {
    setup({ walletMonth: 'OCTOBER', cycle: '2026-10' });

    expect(component['subtitle']).toBe('WALLET OCTOBER · CYCLE 2026-10');
    expect(query('.ecd-subtitle')?.textContent?.trim()).toBe('WALLET OCTOBER · CYCLE 2026-10');
  });

  it('toggleInstallment flips isInstallment and applies/clears the charges validators', () => {
    setup();

    const installmentSwitch = queryAll<HTMLButtonElement>('.ecd-switch-row')[0];
    expect(installmentSwitch.getAttribute('aria-checked')).toBe('false');

    installmentSwitch.click();
    fixture.detectChanges();

    expect(component['form'].controls.isInstallment.value).toBe(true);
    expect(installmentSwitch.getAttribute('aria-checked')).toBe('true');
    expect(component['form'].controls.installmentCharges.hasValidator(Validators.required)).toBe(
      true,
    );
    component['form'].controls.installmentCharges.setValue(0);
    component['form'].controls.installmentCharges.updateValueAndValidity();
    expect(component['form'].controls.installmentCharges.invalid).toBe(true);

    installmentSwitch.click();
    fixture.detectChanges();

    expect(component['form'].controls.isInstallment.value).toBe(false);
    expect(component['form'].controls.installmentCharges.value).toBe(0);
  });

  it('the "Remember the selected card" switch delegates to PreferencesService.toggleRememberCard', () => {
    setup();

    const rememberSwitch = queryAll<HTMLButtonElement>('.ecd-switch-row')[1];
    rememberSwitch.click();

    expect(prefs.toggleRememberCard).toHaveBeenCalledTimes(1);
  });

  it('the "Keep adding after saving" switch binds to the keepOpen form control', () => {
    setup();

    const keepOpenSwitch = queryAll<HTMLButtonElement>('.ecd-switch-row')[2];
    expect(keepOpenSwitch.getAttribute('aria-checked')).toBe('false');

    keepOpenSwitch.click();
    fixture.detectChanges();

    expect(component['form'].controls.keepOpen.value).toBe(true);
    expect(keepOpenSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('submit with an invalid form marks all controls touched and does not close/emit', () => {
    setup();
    const submittedSpy = vi.fn();
    component.submitted.subscribe(submittedSpy);

    component['submit']();

    expect(component['form'].controls.name.touched).toBe(true);
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(submittedSpy).not.toHaveBeenCalled();
  });

  it('submit with a valid form and keepOpen off closes the dialog with the result', () => {
    setup();

    component['form'].patchValue({
      name: 'Mercado',
      cost: 42.5,
      creditCardId: 'card-1',
    });

    component['submit']();

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mercado', cost: 42.5, creditCardId: 'card-1' }),
    );
  });

  it('submit with keepOpen on emits via submitted and resets the form for the next transaction', () => {
    setup();
    const submittedSpy = vi.fn();
    component.submitted.subscribe(submittedSpy);

    component['form'].patchValue({
      name: 'Mercado',
      cost: 42.5,
      creditCardId: 'card-1',
      keepOpen: true,
    });

    component['submit']();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(submittedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mercado', cost: 42.5, creditCardId: 'card-1' }),
    );
    expect(component['form'].controls.name.value).toBe('');
    expect(component['form'].controls.creditCardId.value).toBe('card-1');
    expect(component['form'].controls.keepOpen.value).toBe(true);
  });
});
