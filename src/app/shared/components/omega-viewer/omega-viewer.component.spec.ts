import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { Expense } from '@features/expense/models/expense';
import { Installment } from '@features/installment/models/installment';
import { Subscription } from '@features/subscription/models/subscription';

import { OmegaViewerExpenseDetail } from './models/omega-viewer-detail';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { OmegaViewerComponent } from './omega-viewer.component';
import { OmegaViewerService } from './omega-viewer.service';

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    name: 'Groceries',
    cost: 100,
    purchaseDate: '2026-07-01',
    remaining: 40,
    walletId: 'wallet-1',
    bulletId: 'bullet-1',
    creditCardId: 'card-1',
    installment: false,
    installmentNumber: null,
    installmentId: null,
    tagIds: [],
    ...overrides,
  };
}

function buildInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'installment-1',
    description: 'Laptop',
    details: null,
    originalValue: 3000,
    installmentValue: 250,
    currency: 'BRL',
    installmentNumber: 12,
    purchaseDate: '2026-01-01',
    lastInstallmentDate: '2026-12-01',
    creditCardId: 'card-1',
    sourceWalletId: 'wallet-1',
    sourceEffectiveMonth: '2026-01',
    shared: false,
    ownerRatio: null,
    effectiveOriginalValue: 3000,
    effectiveInstallmentValue: 250,
    tagIds: [],
    sourceExpenseId: null,
    ...overrides,
  };
}

function buildSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'subscription-1',
    description: 'Netflix',
    currency: 'BRL',
    state: 'PRODUCTION',
    flag: 'NONE',
    startMonth: '2026-01',
    endMonth: null,
    versions: [],
    creditCardId: 'card-1',
    tagIds: [],
    ...overrides,
  };
}

describe('OmegaViewerComponent', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialogRef: { close: ReturnType<typeof vi.fn<(result?: OmegaViewerResult) => void>> };

  function setup(initialRef: OmegaViewerRef): void {
    dialogRef = { close: vi.fn<(result?: OmegaViewerResult) => void>() };

    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: initialRef },
      ],
    });

    fixture = TestBed.createComponent(OmegaViewerComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('opens for EXPENSE and resolves the detail via OmegaViewerService', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    httpMock.expectOne('/api/expenses/expense-1').flush(buildExpense());

    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
  });

  it('opens for INSTALLMENT and resolves the detail via OmegaViewerService', () => {
    setup({ kind: 'INSTALLMENT', id: 'installment-1' });

    httpMock.expectOne('/api/installments/installment-1').flush(buildInstallment());

    expect(component['readyDetail']()?.kind).toBe('INSTALLMENT');
  });

  it('opens for SUBSCRIPTION and resolves the detail via OmegaViewerService', () => {
    setup({ kind: 'SUBSCRIPTION', id: 'subscription-1' });

    httpMock.expectOne('/api/subscriptions/subscription-1').flush(buildSubscription());

    expect(component['readyDetail']()?.kind).toBe('SUBSCRIPTION');
  });

  it('shows the error state and retries on demand', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    httpMock.expectOne('/api/expenses/expense-1').flush('boom', { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(component['detailState']().status).toBe('error');

    component['retry']();
    fixture.detectChanges();

    httpMock.expectOne('/api/expenses/expense-1').flush(buildExpense());
    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
  });

  it('cancels the in-flight request when navigating again before it resolves', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    const firstRequest = httpMock.expectOne('/api/expenses/expense-1');

    // Navigate away before the first request resolves — switchMap must unsubscribe it.
    component['navigateTo']({ kind: 'SUBSCRIPTION', id: 'subscription-1' });
    fixture.detectChanges();

    // switchMap unsubscribed the first request — Angular's HttpTestingController marks it
    // cancelled, and it can no longer be flushed at all, which is itself proof the abandoned
    // response can never overwrite the newer navigation's result.
    expect(firstRequest.cancelled).toBe(true);

    httpMock.expectOne('/api/subscriptions/subscription-1').flush(buildSubscription());
    expect(component['readyDetail']()?.kind).toBe('SUBSCRIPTION');
  });

  it('goBack pops the stack and always refetches (no caching)', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    httpMock.expectOne('/api/expenses/expense-1').flush(buildExpense({ installmentId: 'installment-1' }));
    httpMock
      .expectOne('/api/installments/installment-1')
      .flush(buildInstallment({ id: 'installment-1', sourceExpenseId: 'expense-1' }));

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();

    httpMock.expectOne('/api/installments/installment-1').flush(buildInstallment({ id: 'installment-1' }));
    expect(component['canGoBack']()).toBe(true);
    expect(component['readyDetail']()?.kind).toBe('INSTALLMENT');

    component['goBack']();
    fixture.detectChanges();

    // Back must issue a brand new request for the same ref — no cache hit.
    const refetch = httpMock.expectOne('/api/expenses/expense-1');
    refetch.flush(buildExpense());

    expect(component['canGoBack']()).toBe(false);
    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
  });

  it('close() reports mutated:false when nothing changed', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });
    httpMock.expectOne('/api/expenses/expense-1').flush(buildExpense());

    component['close']();

    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
  });
});

describe('OmegaViewerComponent — audit metadata + deleted strip (F-13)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;

  function buildExpenseDetail(
    overrides: Partial<OmegaViewerExpenseDetail> = {},
  ): OmegaViewerExpenseDetail {
    return {
      kind: 'EXPENSE',
      ref: { kind: 'EXPENSE', id: 'expense-1' },
      name: 'Groceries',
      cost: 100,
      remaining: 40,
      purchaseDate: '2026-07-01',
      creditCardId: 'card-1',
      details: null,
      tagIds: [],
      payerName: null,
      payments: [],
      installmentsRemaining: null,
      links: [],
      audit: { createdAt: '2026-01-01', updatedAt: '2026-02-15', deletedAt: null },
      ...overrides,
    };
  }

  async function setup(detail: OmegaViewerExpenseDetail): Promise<void> {
    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { kind: 'EXPENSE', id: 'expense-1' } },
      ],
    });
    // OmegaViewerComponent declares `providers: [OmegaViewerService]` at the component level
    // (component-scoped, not providedIn: 'root' — see the component's own doc comment), which
    // shadows a module-level TestBed override. TestBed.overrideComponent replaces that
    // component-level provider directly so the stub actually reaches the component's injector.
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: { providers: [{ provide: OmegaViewerService, useValue: { load: () => of(detail) } }] },
    });

    fixture = TestBed.createComponent(OmegaViewerComponent);
    fixture.detectChanges();
    // toSignal's underlying switchMap/toObservable chain settles the synchronous of(detail)
    // emission on a microtask (RxJS interop scheduler) — whenStable() flushes it before the
    // DOM assertions read the rendered output.
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders the audit metadata line, formatted via BrDatePipe, when audit is present', async () => {
    await setup(buildExpenseDetail({ audit: { createdAt: '2026-01-01', updatedAt: '2026-02-15', deletedAt: null } }));

    const text = (fixture.nativeElement as HTMLElement).querySelector('.ovw__audit')?.textContent ?? '';

    expect(text).toContain('Criado em');
    expect(text).toContain('Atualizado em');
    // BrDatePipe formats as pt-BR dd/mm/yyyy — exercise the real pipe, not a stub.
    expect(text).toContain('01/01/2026');
    expect(text).toContain('15/02/2026');
  });

  it('hides the audit metadata line entirely when audit is null', async () => {
    await setup(buildExpenseDetail({ audit: null }));

    const el = (fixture.nativeElement as HTMLElement).querySelector('.ovw__audit');

    expect(el).toBeNull();
  });

  it('shows the deleted strip when deletedAt is non-null', async () => {
    await setup(
      buildExpenseDetail({
        audit: { createdAt: '2026-01-01', updatedAt: '2026-02-15', deletedAt: '2026-03-01' },
      }),
    );

    const alert = (fixture.nativeElement as HTMLElement).querySelector('.ew-alert[role="alert"]');

    expect(alert).not.toBeNull();
  });

  it('hides the deleted strip when deletedAt is null', async () => {
    await setup(buildExpenseDetail({ audit: { createdAt: '2026-01-01', updatedAt: '2026-02-15', deletedAt: null } }));

    const alert = (fixture.nativeElement as HTMLElement).querySelector('.ew-alert[role="alert"]');

    expect(alert).toBeNull();
  });

  it('hides both the metadata line and the deleted strip when audit is null, even if the item is conceptually deleted', async () => {
    await setup(buildExpenseDetail({ audit: null }));

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.ovw__audit')).toBeNull();
    expect(root.querySelector('.ew-alert[role="alert"]')).toBeNull();
  });
});
