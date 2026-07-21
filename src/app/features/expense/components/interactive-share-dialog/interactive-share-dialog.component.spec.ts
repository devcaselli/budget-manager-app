import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Payer } from '@features/payer/models/payer';
import { Share } from '@features/share/models/share';

import {
  InteractiveShareDialogComponent,
  InteractiveShareDialogData,
} from './interactive-share-dialog.component';

function buildPayer(overrides: Partial<Payer> = {}): Payer {
  return {
    id: 'payer-1',
    name: 'Maria',
    type: 'STANDING',
    walletId: 'wallet-1',
    subscriptionId: null,
    paymentDate: '2026-06-01',
    amountDue: 0,
    currency: 'BRL',
    deleted: false,
    ...overrides,
  };
}

function buildShare(overrides: Partial<Share> = {}): Share {
  return {
    id: 'share-1',
    walletId: 'wallet-1',
    sourceType: 'EXPENSE',
    sourceId: 'expense-1',
    totalAmount: 100,
    ownerShare: 70,
    ownerRatio: 0.7,
    currency: 'BRL',
    status: 'ACTIVE',
    quotas: [{ payerId: 'payer-1', payerName: 'Maria', ratio: 0.3, amount: 30, paymentIds: [] }],
    paymentIds: [],
    createdAt: '2026-06-01T10:00:00Z',
    revertedAt: null,
    stoppedFromMonth: null,
    ...overrides,
  };
}

describe('InteractiveShareDialogComponent', () => {
  let fixture: ComponentFixture<InteractiveShareDialogComponent>;
  let component: InteractiveShareDialogComponent;
  let httpMock: HttpTestingController;
  let dialogRef: { close: ReturnType<typeof vi.fn<(result?: Share) => void>> };
  let dialogData: InteractiveShareDialogData;

  function setup(payers: readonly Payer[] = [buildPayer()]): void {
    dialogRef = { close: vi.fn<(result?: Share) => void>() };
    dialogData = {
      walletId: 'wallet-1',
      expense: { id: 'expense-1', name: 'Groceries', cost: 100, currency: 'BRL' },
      payers,
    };

    TestBed.configureTestingModule({
      imports: [InteractiveShareDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    });

    fixture = TestBed.createComponent(InteractiveShareDialogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock?.verify({ ignoreCancelled: true });
  });

  describe('EXISTING mode (default)', () => {
    beforeEach(() => setup());

    it('starts on step 0 with EXISTING mode', () => {
      expect(component['currentStep']()).toBe(0);
      expect(component['modeValue']()).toBe('EXISTING');
    });

    it('selecting a payer sets payerId and advances to step 1', () => {
      component['selectPayer']('payer-1');

      expect(component['form'].controls.payerId.value).toBe('payer-1');
      expect(component['currentStep']()).toBe(1);
      expect(component['selectedPayer']()?.name).toBe('Maria');
    });

    it('recomputes ownerAmount reactively as the amount changes', () => {
      component['selectPayer']('payer-1');

      component['form'].controls.amount.setValue(30);
      expect(component['ownerAmount']()).toBe(70);

      component['form'].controls.amount.setValue(100);
      expect(component['ownerAmount']()).toBe(0);

      component['form'].controls.amount.setValue(0.01);
      expect(component['ownerAmount']()).toBe(99.99);
    });

    it('rejects amount of 0, accepts within (0, cost], rejects above cost', () => {
      const amount = component['form'].controls.amount;

      amount.setValue(0);
      expect(amount.valid).toBe(false);

      amount.setValue(50);
      expect(amount.valid).toBe(true);

      amount.setValue(100);
      expect(amount.valid).toBe(true);

      amount.setValue(100.01);
      expect(amount.valid).toBe(false);
    });

    it('submit() sends the expected CreateShareRequest and advances to the success step', () => {
      component['selectPayer']('payer-1');
      component['form'].controls.amount.setValue(30);

      component['submit']();

      const request = httpMock.expectOne('/api/shares');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        walletId: 'wallet-1',
        sourceType: 'EXPENSE',
        sourceId: 'expense-1',
        totalAmount: 100,
        currency: 'BRL',
        ownerShare: 70,
        quotas: [{ payerId: 'payer-1', amount: 30 }],
      });

      request.flush(buildShare());

      expect(component['currentStep']()).toBe(2);
      expect(component['createdShare']()?.id).toBe('share-1');
    });

    it('stays on step 1 and shows an error when create fails', () => {
      component['selectPayer']('payer-1');
      component['form'].controls.amount.setValue(30);
      component['submit']();

      const request = httpMock.expectOne('/api/shares');
      request.flush('error', { status: 500, statusText: 'Server Error' });

      expect(component['currentStep']()).toBe(1);
      expect(component['errorMessage']()).toBeTruthy();
    });

    it('close() closes the dialog with the created share', () => {
      component['createdShare'].set(buildShare());
      component['close']();

      expect(dialogRef.close).toHaveBeenCalledWith(buildShare());
    });
  });

  describe('TRANSIENT mode', () => {
    beforeEach(() => setup());

    it('switching to TRANSIENT clears payerId and shows the name form', () => {
      component['selectMode']('TRANSIENT');

      expect(component['modeValue']()).toBe('TRANSIENT');
      expect(component['form'].controls.payerId.value).toBe('');
    });

    it('continueTransient() is blocked until a name is entered', () => {
      component['selectMode']('TRANSIENT');
      component['continueTransient']();
      expect(component['currentStep']()).toBe(0);

      component['form'].controls.transientName.setValue('João');
      component['continueTransient']();
      expect(component['currentStep']()).toBe(1);
      expect(component['payerDisplayName']()).toBe('João');
    });

    it('submit() sends a transient_ quota with no payerId', () => {
      component['selectMode']('TRANSIENT');
      component['form'].controls.transientName.setValue('João');
      component['continueTransient']();
      component['form'].controls.amount.setValue(20);

      component['submit']();

      const request = httpMock.expectOne('/api/shares');
      expect(request.request.body).toEqual({
        walletId: 'wallet-1',
        sourceType: 'EXPENSE',
        sourceId: 'expense-1',
        totalAmount: 100,
        currency: 'BRL',
        ownerShare: 80,
        quotas: [{ transient_: { name: 'João' }, amount: 20 }],
      });

      request.flush(buildShare({ id: 'share-2' }));
    });
  });

  describe('NEW mode (create a permanent payer)', () => {
    beforeEach(() => setup());

    it('continueNewPayer() is blocked until a name is entered', () => {
      component['selectMode']('NEW');
      component['continueNewPayer']();
      expect(component['currentStep']()).toBe(0);

      component['form'].controls.newPayerName.setValue('Carla');
      component['continueNewPayer']();
      expect(component['currentStep']()).toBe(1);
      expect(component['payerDisplayName']()).toBe('Carla');
    });

    it('submit() creates the payer first, then the share using the new payerId', () => {
      component['selectMode']('NEW');
      component['form'].controls.newPayerName.setValue('Carla');
      component['continueNewPayer']();
      component['form'].controls.amount.setValue(40);

      component['submit']();

      const payerRequest = httpMock.expectOne('/api/payers');
      expect(payerRequest.request.method).toBe('POST');
      expect(payerRequest.request.body).toEqual({
        name: 'Carla',
        type: 'STANDING',
        paymentDate: expect.any(String),
      });
      payerRequest.flush(buildPayer({ id: 'payer-new', name: 'Carla' }));

      const shareRequest = httpMock.expectOne('/api/shares');
      expect(shareRequest.request.body).toEqual({
        walletId: 'wallet-1',
        sourceType: 'EXPENSE',
        sourceId: 'expense-1',
        totalAmount: 100,
        currency: 'BRL',
        ownerShare: 60,
        quotas: [{ payerId: 'payer-new', amount: 40 }],
      });
      shareRequest.flush(buildShare({ id: 'share-3' }));

      expect(component['currentStep']()).toBe(2);
      expect(component['createdShare']()?.id).toBe('share-3');
    });
  });

  describe('empty payer list', () => {
    beforeEach(() => setup([]));

    it('still allows TRANSIENT mode when there are no existing payers', () => {
      expect(dialogData.payers).toHaveLength(0);
      component['selectMode']('TRANSIENT');
      expect(component['modeValue']()).toBe('TRANSIENT');
    });
  });

  it('cancel (no result) does not call close with a value when dialogRef.close() is invoked directly with no arg', () => {
    setup();
    dialogRef.close();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
