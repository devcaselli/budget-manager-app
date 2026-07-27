import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { ExpenseService } from '@features/expense/services/expense.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { ShareService } from '@features/share/services/share.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Expense } from '@features/expense/models/expense';
import { Share } from '@features/share/models/share';
import { Wallet } from '@features/wallet/models/wallet';
import { Payer } from '@features/payer/models/payer';

import { ShareFormComponent } from '../share-form/share-form.component';
import { ShareFormDialogComponent } from './share-form-dialog.component';

class FakeShareService {
  readonly shares$ = new BehaviorSubject<readonly Share[]>([]);
  readonly saving$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadAll = vi.fn();
  create = vi.fn();
}

class FakeExpenseService {
  readonly expenses$ = new BehaviorSubject<readonly Expense[]>([]);
  loadByWalletId = vi.fn();
}

class FakeInstallmentService {
  readonly allInstallments$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

class FakeSubscriptionService {
  readonly subscriptions$ = new BehaviorSubject<readonly unknown[]>([]);
  loadSubscriptions = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>(null);
  findPayersByWalletId(): Observable<Payer[]> {
    return of([]);
  }
}

describe('ShareFormDialogComponent', () => {
  let fixture: ComponentFixture<ShareFormDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [ShareFormDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShareService, useClass: FakeShareService },
        { provide: ExpenseService, useClass: FakeExpenseService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: SubscriptionService, useClass: FakeSubscriptionService },
        { provide: WalletService, useClass: FakeWalletService },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });

    fixture = TestBed.createComponent(ShareFormDialogComponent);
    fixture.detectChanges();
  });

  it('hosts ShareFormComponent inside the dialog frame', () => {
    const hostedForm = fixture.debugElement.query((node) => node.componentInstance instanceof ShareFormComponent);
    expect(hostedForm).toBeTruthy();
  });

  it('does not render its own submit button — the form template owns the only one', () => {
    // The frame must only contribute Cancel; a duplicate submit button in the frame was
    // explicitly ruled out (frontend-tasks.md Task 4).
    const submitButtons = fixture.nativeElement.querySelectorAll('button[type="submit"]');
    // Exactly one — the one inside app-share-form's own template (ew-btn-submit).
    expect(submitButtons.length).toBe(1);
  });

  it('renders a Cancel action wired to mat-dialog-close', () => {
    const cancelButtons = fixture.nativeElement.querySelectorAll('[mat-dialog-close]');
    expect(cancelButtons.length).toBeGreaterThan(0);
  });

  it('closes the dialog with the created share when the form emits `created`', () => {
    const hostedForm = fixture.debugElement.query(
      (node) => node.componentInstance instanceof ShareFormComponent,
    ).componentInstance as ShareFormComponent;

    const created: Share = {
      id: 'share-new',
      walletId: 'wallet-1',
      sourceType: 'EXPENSE',
      sourceId: 'expense-1',
      sourceName: 'Groceries',
      totalAmount: 100,
      ownerShare: 70,
      ownerRatio: 0.7,
      currency: 'BRL',
      status: 'ACTIVE',
      quotas: [],
      paymentIds: [],
      createdAt: '2026-06-01T10:00:00Z',
      revertedAt: null,
      stoppedFromMonth: null,
    };

    hostedForm.created.emit(created);

    expect(dialogRef.close).toHaveBeenCalledWith(created);
  });
});
