import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
} from './models/omega-viewer-detail';
import {
  ExpenseViewerResponseDto,
  InstallmentViewerResponseDto,
  SubscriptionViewerResponseDto,
} from './models/omega-viewer-dto';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { OmegaViewerComponent } from './omega-viewer.component';
import { OmegaViewerService } from './omega-viewer.service';

function buildExpenseDto(overrides: Partial<ExpenseViewerResponseDto> = {}): ExpenseViewerResponseDto {
  return {
    id: 'expense-1',
    name: 'Groceries',
    cost: 100,
    remaining: 40,
    purchaseDate: '2026-07-01',
    walletId: 'wallet-1',
    creditCardId: 'card-1',
    flag: 'NONE',
    hidden: false,
    details: null,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-01T10:00:00Z',
    tags: [],
    paymentTrace: [],
    refs: [],
    ...overrides,
  };
}

function buildInstallmentDto(
  overrides: Partial<InstallmentViewerResponseDto> = {},
): InstallmentViewerResponseDto {
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
    sourceEffectiveMonth: '2026-01',
    deleted: false,
    deletedAt: null,
    flag: 'NONE',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
    paymentTrace: [],
    refs: [],
    ...overrides,
  };
}

function buildSubscriptionDto(
  overrides: Partial<SubscriptionViewerResponseDto> = {},
): SubscriptionViewerResponseDto {
  return {
    id: 'subscription-1',
    description: 'Netflix',
    currency: 'BRL',
    startMonth: '2026-01',
    endMonth: null,
    state: 'PRODUCTION',
    creditCardId: 'card-1',
    flag: 'NONE',
    details: null,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    versions: [],
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

    // F-07: the shell defensively refreshes the credit-card cache on construction (needed by
    // the Expense edit form's <select>) — flush it here so it doesn't leak as a pending
    // request into every test in this block, none of which are about credit cards.
    httpMock.expectOne('/api/credit-cards?page=0&size=100').flush({
      content: [],
      page: 0,
      size: 100,
      totalElements: 0,
      totalPages: 0,
    });
  }

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('opens for EXPENSE and resolves the detail via OmegaViewerService', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    httpMock.expectOne('/api/viewer/expenses/expense-1').flush(buildExpenseDto());

    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
  });

  it('opens for INSTALLMENT and resolves the detail via OmegaViewerService', () => {
    setup({ kind: 'INSTALLMENT', id: 'installment-1' });

    httpMock.expectOne('/api/viewer/installments/installment-1').flush(buildInstallmentDto());

    expect(component['readyDetail']()?.kind).toBe('INSTALLMENT');
  });

  it('opens for SUBSCRIPTION and resolves the detail via OmegaViewerService', () => {
    setup({ kind: 'SUBSCRIPTION', id: 'subscription-1' });

    httpMock.expectOne('/api/viewer/subscriptions/subscription-1').flush(buildSubscriptionDto());

    expect(component['readyDetail']()?.kind).toBe('SUBSCRIPTION');
  });

  it('shows the error state and retries on demand', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    httpMock
      .expectOne('/api/viewer/expenses/expense-1')
      .flush('boom', { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(component['detailState']().status).toBe('error');

    component['retry']();
    fixture.detectChanges();

    httpMock.expectOne('/api/viewer/expenses/expense-1').flush(buildExpenseDto());
    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
  });

  it('cancels the in-flight request when navigating again before it resolves', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    const firstRequest = httpMock.expectOne('/api/viewer/expenses/expense-1');

    // Navigate away before the first request resolves — switchMap must unsubscribe it.
    component['navigateTo']({ kind: 'SUBSCRIPTION', id: 'subscription-1' });
    fixture.detectChanges();

    // switchMap unsubscribed the first request — Angular's HttpTestingController marks it
    // cancelled, and it can no longer be flushed at all, which is itself proof the abandoned
    // response can never overwrite the newer navigation's result.
    expect(firstRequest.cancelled).toBe(true);

    httpMock.expectOne('/api/viewer/subscriptions/subscription-1').flush(buildSubscriptionDto());
    expect(component['readyDetail']()?.kind).toBe('SUBSCRIPTION');
  });

  it('goBack pops the stack and always refetches (no caching)', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });

    httpMock.expectOne('/api/viewer/expenses/expense-1').flush(
      buildExpenseDto({ refs: [{ type: 'INSTALLMENT', id: 'installment-1', label: 'Parcelamento' }] }),
    );

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();

    httpMock
      .expectOne('/api/viewer/installments/installment-1')
      .flush(buildInstallmentDto({ id: 'installment-1' }));
    expect(component['canGoBack']()).toBe(true);
    expect(component['readyDetail']()?.kind).toBe('INSTALLMENT');

    component['goBack']();
    fixture.detectChanges();

    // Back must issue a brand new request for the same ref — no cache hit.
    const refetch = httpMock.expectOne('/api/viewer/expenses/expense-1');
    refetch.flush(buildExpenseDto());

    expect(component['canGoBack']()).toBe(false);
    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
  });

  it('close() reports mutated:false when nothing changed', () => {
    setup({ kind: 'EXPENSE', id: 'expense-1' });
    httpMock.expectOne('/api/viewer/expenses/expense-1').flush(buildExpenseDto());

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
        provideHttpClient(),
        provideHttpClientTesting(),
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

    // F-07: flush the shell's defensive credit-card cache refresh (see the equivalent comment
    // in the describe block above) — irrelevant to what this block asserts.
    TestBed.inject(HttpTestingController)
      .expectOne('/api/credit-cards?page=0&size=100')
      .flush({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });

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

describe('OmegaViewerComponent — link navigation, focus, aria-live, reduced-motion (F-11)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let matchMediaSpy: ReturnType<typeof vi.fn>;

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
      links: [{ ref: { kind: 'INSTALLMENT', id: 'installment-1' }, label: 'Laptop' }],
      audit: null,
      ...overrides,
    };
  }

  function buildInstallmentDetail(
    overrides: Partial<OmegaViewerInstallmentDetail> = {},
  ): OmegaViewerInstallmentDetail {
    return {
      kind: 'INSTALLMENT',
      ref: { kind: 'INSTALLMENT', id: 'installment-1' },
      description: 'Laptop',
      originalValue: 3000,
      installmentValue: 250,
      installmentNumber: 12,
      purchaseDate: '2026-01-01',
      lastInstallmentDate: '2026-12-01',
      creditCardId: 'card-1',
      details: null,
      tagIds: [],
      payerName: null,
      progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
      links: [{ ref: { kind: 'EXPENSE', id: 'expense-1' }, label: 'Groceries' }],
      audit: null,
      ...overrides,
    };
  }

  /** Stubs `OmegaViewerService.load` to resolve by ref.kind — lets a `navigateTo` click walk
   * Expense -> Installment -> back without a real HTTP round trip, matching the F-13 spec
   * block's `TestBed.overrideComponent` pattern for the component-scoped provider. */
  async function setup(reducedMotion: boolean): Promise<void> {
    matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaSpy);

    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { kind: 'EXPENSE', id: 'expense-1' } },
      ],
    });
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          {
            provide: OmegaViewerService,
            useValue: {
              load: (ref: OmegaViewerRef): ReturnType<OmegaViewerService['load']> => {
                const detail: OmegaViewerDetail =
                  ref.kind === 'EXPENSE' ? buildExpenseDetail() : buildInstallmentDetail();
                return of(detail);
              },
            },
          },
        ],
      },
    });

    fixture = TestBed.createComponent(OmegaViewerComponent);
    fixture.detectChanges();

    // F-07: flush the shell's defensive credit-card cache refresh (see the equivalent comment
    // in the first describe block above) — irrelevant to link-navigation/focus/aria-live/
    // reduced-motion assertions in this block.
    TestBed.inject(HttpTestingController)
      .expectOne('/api/credit-cards?page=0&size=100')
      .flush({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });

    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a .ew-btn--ghost row with chevron_right per link, wired to navigateTo', async () => {
    await setup(false);

    const root = fixture.nativeElement as HTMLElement;
    const linkRow = root.querySelector('.ovw__link-row') as HTMLButtonElement;

    expect(linkRow).not.toBeNull();
    expect(linkRow.classList.contains('ew-btn--ghost')).toBe(true);
    expect(linkRow.textContent).toContain('Laptop');
    expect(linkRow.querySelector('mat-icon')?.textContent?.trim()).toBe('chevron_right');
  });

  it('navigates Expense -> Installment -> Back end-to-end via link rows and the back button', async () => {
    await setup(false);

    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.ovw__link-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.ovw__item-title')?.textContent).toBe(
      'Laptop',
    );

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ovw__back')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.ovw__item-title')?.textContent).toBe(
      'Groceries',
    );
  });

  it('moves keyboard focus to the new item title on every page-flip — never lost', async () => {
    await setup(false);

    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.ovw__link-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const title = (fixture.nativeElement as HTMLElement).querySelector('.ovw__item-title');
    expect(document.activeElement).toBe(title);
  });

  it('announces the navigation via the aria-live region', async () => {
    await setup(false);

    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.ovw__link-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const live = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Laptop');
  });

  it('does not announce anything on the initial load — only on subsequent navigations', async () => {
    await setup(false);

    const live = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
    expect(live?.textContent?.trim()).toBe('');
  });

  it('applies the slide+fade animation class when reduced motion is NOT requested', async () => {
    await setup(false);

    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.ovw__link-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    // Flush the queued microtask that re-arms the animation class.
    await Promise.resolve();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ovw__flip')?.classList.contains(
        'ovw__flip--anim',
      ),
    ).toBe(true);
  });

  it('never applies the animation class when prefers-reduced-motion is set', async () => {
    await setup(true);

    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.ovw__link-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ovw__flip')?.classList.contains(
        'ovw__flip--anim',
      ),
    ).toBe(false);
  });
});

describe('OmegaViewerComponent — Expense edit mode (F-07)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

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
      links: [{ ref: { kind: 'INSTALLMENT', id: 'installment-1' }, label: 'Laptop' }],
      audit: null,
      ...overrides,
    };
  }

  function buildInstallmentDetail(
    overrides: Partial<OmegaViewerInstallmentDetail> = {},
  ): OmegaViewerInstallmentDetail {
    return {
      kind: 'INSTALLMENT',
      ref: { kind: 'INSTALLMENT', id: 'installment-1' },
      description: 'Laptop',
      originalValue: 3000,
      installmentValue: 250,
      installmentNumber: 12,
      purchaseDate: '2026-01-01',
      lastInstallmentDate: '2026-12-01',
      creditCardId: 'card-1',
      details: null,
      tagIds: [],
      payerName: null,
      progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
      links: [{ ref: { kind: 'EXPENSE', id: 'expense-1' }, label: 'Groceries' }],
      audit: null,
      ...overrides,
    };
  }

  /** `dialog.open` defaults to resolving `afterClosed()` with `true` (user confirms discard)
   * — most tests in this block want navigation to actually go through; the guard-blocks
   * tests below override this per-call to resolve `false` instead. */
  async function setup(): Promise<void> {
    dialogRef = { close: vi.fn() };
    dialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }),
    };

    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { kind: 'EXPENSE', id: 'expense-1' } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    // `OmegaViewerComponent` imports `MatDialogModule` into its own standalone `imports`
    // array (needed for the `mat-dialog-title`/`mat-dialog-content` template directives) —
    // that NgModule import re-registers `MatDialog` at the component's own injector level,
    // which wins over the TestBed-level `useValue` override above. Overriding it here too,
    // exactly like `OmegaViewerService` below, makes the stub actually reach the component.
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          {
            provide: OmegaViewerService,
            useValue: {
              load: (ref: OmegaViewerRef): ReturnType<OmegaViewerService['load']> => {
                const detail: OmegaViewerDetail =
                  ref.kind === 'EXPENSE' ? buildExpenseDetail() : buildInstallmentDetail();
                return of(detail);
              },
            },
          },
        ],
      },
    });

    fixture = TestBed.createComponent(OmegaViewerComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/credit-cards?page=0&size=100')
      .flush({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });

    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('starts in VIEW mode', async () => {
    await setup();
    expect(component['mode']()).toBe('VIEW');
  });

  it('"Editar" button enters EDIT mode and renders the edit form', async () => {
    await setup();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__edit-btn')?.click();
    fixture.detectChanges();

    expect(component['mode']()).toBe('EDIT');
    expect(root.querySelector('app-viewer-edit-form')).not.toBeNull();
    expect(root.querySelector('app-viewer-field-list')).toBeNull();
  });

  it('resets to VIEW on navigateTo (push)', async () => {
    await setup();

    component['enterEditMode']();
    expect(component['mode']()).toBe('EDIT');

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['mode']()).toBe('VIEW');
  });

  it('resets to VIEW on goBack (pop)', async () => {
    await setup();

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['enterEditMode'](); // no-op: current item is INSTALLMENT, not EXPENSE — mode stays VIEW
    expect(component['mode']()).toBe('VIEW');

    component['goBack']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['mode']()).toBe('VIEW');
  });

  it('was EDIT on item A, navigates to B, comes back to A — mode must be VIEW again, not preserved', async () => {
    await setup();

    // A (Expense) starts in EDIT.
    component['enterEditMode']();
    expect(component['mode']()).toBe('EDIT');

    // Navigate to B (Installment) — dirty guard doesn't fire (form was never made dirty here).
    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component['mode']()).toBe('VIEW');

    // Back to A.
    component['goBack']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Must be VIEW, not the EDIT it was left in before navigating away.
    expect(component['mode']()).toBe('VIEW');
  });

  it('dirty form blocks navigateTo until the discard dialog is confirmed', async () => {
    await setup();

    component['enterEditMode']();
    component['onFormDirtyChange'](true);

    dialog.open.mockReturnValue({ afterClosed: () => of(false) }); // user cancels discard

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalled();
    // Still on the original item, still in EDIT — nothing was discarded.
    expect(component['current']()).toEqual({ kind: 'EXPENSE', id: 'expense-1' });
    expect(component['mode']()).toBe('EDIT');
  });

  it('dirty form allows navigateTo once the discard dialog is confirmed', async () => {
    await setup();

    component['enterEditMode']();
    component['onFormDirtyChange'](true);

    dialog.open.mockReturnValue({ afterClosed: () => of(true) }); // user confirms discard

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['current']()).toEqual({ kind: 'INSTALLMENT', id: 'installment-1' });
    expect(component['mode']()).toBe('VIEW');
  });

  it('dirty form blocks close() until the discard dialog is confirmed', async () => {
    await setup();

    component['enterEditMode']();
    component['onFormDirtyChange'](true);
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    component['close']();

    expect(dialog.open).toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('close() proceeds immediately when the form is not dirty', async () => {
    await setup();

    component['close']();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
  });

  it('sets MatDialogRef.disableClose while EDIT + dirty, clears it otherwise', async () => {
    await setup();

    expect(component['dialogRef' as never]).toBeDefined();
    expect(dialogRef['disableClose' as never]).toBeFalsy();

    // Two separate flush cycles — `enterEditMode()` and `onFormDirtyChange(true)` each need
    // their own `detectChanges()`/`whenStable()` pair for the shell's `disableClose` effect
    // to observe the fully-settled state; batching both signal writes before the first flush
    // is unreliable in this Angular version's effect-scheduling (an app-code concern this
    // test isolates, not a production bug — a real user's `dirtyChange` emission always
    // arrives as its own separate change-detection turn, never coalesced with `enterEditMode`).
    component['enterEditMode']();
    fixture.detectChanges();
    await fixture.whenStable();

    component['onFormDirtyChange'](true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);

    component['onFormDirtyChange'](false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(false);
  });

  it('saveEdit patches via ExpenseService, updates the displayed detail, exits EDIT, and flags mutated', async () => {
    await setup();

    component['enterEditMode']();
    fixture.detectChanges();

    component['saveEdit']({ cost: 250 });

    const patchRequest = httpMock.expectOne('/api/expenses/expense-1');
    expect(patchRequest.request.method).toBe('PATCH');
    expect(patchRequest.request.body).toEqual({ cost: 250 });

    patchRequest.flush({
      id: 'expense-1',
      name: 'Groceries',
      cost: 250,
      // Backend-computed remaining — the frontend must display this verbatim, never derive
      // its own value from the patch payload.
      remaining: 190,
      purchaseDate: '2026-07-01',
      walletId: 'wallet-1',
      creditCardId: 'card-1',
      installment: false,
      details: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['mode']()).toBe('VIEW');
    const detail = component['readyDetail']();
    expect(detail?.kind).toBe('EXPENSE');
    expect((detail as OmegaViewerExpenseDetail).cost).toBe(250);
    expect((detail as OmegaViewerExpenseDetail).remaining).toBe(190);

    component['close']();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
  });

  it('saveEdit does not flag mutated or touch the dialog on a failed patch', async () => {
    await setup();

    component['enterEditMode']();
    component['saveEdit']({ cost: 250 });

    httpMock
      .expectOne('/api/expenses/expense-1')
      .flush('boom', { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    component['close']();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
  });

  it('enterEditMode is a no-op when the current item is not an Expense', async () => {
    await setup();

    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component['enterEditMode']();

    expect(component['mode']()).toBe('VIEW');
  });
});
