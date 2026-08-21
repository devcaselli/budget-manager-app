import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, Subject } from 'rxjs';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerPayment,
  OmegaViewerReservedBudgetMigrationDetail,
} from './models/omega-viewer-detail';
import {
  ExpenseViewerResponseDto,
  InstallmentViewerResponseDto,
  SubscriptionViewerResponseDto,
} from './models/omega-viewer-dto';
import { OmegaViewerRef } from './models/omega-viewer-ref';
import { OmegaViewerResult } from './models/omega-viewer-result';
import { OmegaViewerComponent } from './omega-viewer.component';
import { OmegaViewerLauncher } from './omega-viewer-launcher';
import { OmegaViewerService } from './omega-viewer.service';

function buildExpenseDto(
  overrides: Partial<ExpenseViewerResponseDto> = {},
): ExpenseViewerResponseDto {
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
  let dialogRef: {
    close: ReturnType<typeof vi.fn<(result?: OmegaViewerResult) => void>>;
    keydownEvents: ReturnType<typeof vi.fn>;
    backdropClick: ReturnType<typeof vi.fn>;
  };

  function setup(initialRef: OmegaViewerRef): void {
    // C1: the shell now subscribes to `keydownEvents()`/`backdropClick()` in its constructor
    // (routes ESC/backdrop through `close()`, same as the "×" button) — every `MatDialogRef`
    // stub needs both, or construction throws on `.pipe()` of `undefined`. Empty streams here
    // are enough for tests in this block that don't exercise C1 directly.
    dialogRef = {
      close: vi.fn<(result?: OmegaViewerResult) => void>(),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
    };

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

    httpMock
      .expectOne('/api/viewer/expenses/expense-1')
      .flush(
        buildExpenseDto({
          refs: [{ type: 'INSTALLMENT', id: 'installment-1', label: 'Parcelamento' }],
        }),
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
        {
          provide: MatDialogRef,
          // C1: constructor now subscribes to keydownEvents()/backdropClick() — every stub
          // needs both, or construction throws on `.pipe()` of `undefined`.
          useValue: {
            close: vi.fn(),
            keydownEvents: vi.fn().mockReturnValue(of()),
            backdropClick: vi.fn().mockReturnValue(of()),
          },
        },
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
    await setup(
      buildExpenseDetail({
        audit: { createdAt: '2026-01-01', updatedAt: '2026-02-15', deletedAt: null },
      }),
    );

    const text =
      (fixture.nativeElement as HTMLElement).querySelector('.ovw__audit')?.textContent ?? '';

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
    await setup(
      buildExpenseDetail({
        audit: { createdAt: '2026-01-01', updatedAt: '2026-02-15', deletedAt: null },
      }),
    );

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
      payments: [],
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
        {
          provide: MatDialogRef,
          // C1: constructor now subscribes to keydownEvents()/backdropClick() — every stub
          // needs both, or construction throws on `.pipe()` of `undefined`.
          useValue: {
            close: vi.fn(),
            keydownEvents: vi.fn().mockReturnValue(of()),
            backdropClick: vi.fn().mockReturnValue(of()),
          },
        },
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

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ovw__item-title')?.textContent,
    ).toBe('Laptop');

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ovw__back')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ovw__item-title')?.textContent,
    ).toBe('Groceries');
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
      (fixture.nativeElement as HTMLElement)
        .querySelector('.ovw__flip')
        ?.classList.contains('ovw__flip--anim'),
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
      (fixture.nativeElement as HTMLElement)
        .querySelector('.ovw__flip')
        ?.classList.contains('ovw__flip--anim'),
    ).toBe(false);
  });
});

describe('OmegaViewerComponent — Expense edit mode (F-07)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    keydownEvents: ReturnType<typeof vi.fn>;
    backdropClick: ReturnType<typeof vi.fn>;
  };
  /** Subjects backing this block's `dialogRef.keydownEvents()`/`backdropClick()` — tests that
   * exercise C1 push synthetic events through these instead of re-creating the fixture. */
  let keydownEvents$: Subject<{ key: string }>;
  let backdropClick$: Subject<void>;

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
      payments: [],
      links: [{ ref: { kind: 'EXPENSE', id: 'expense-1' }, label: 'Groceries' }],
      audit: null,
      ...overrides,
    };
  }

  /** `dialog.open` defaults to resolving `afterClosed()` with `true` (user confirms discard)
   * — most tests in this block want navigation to actually go through; the guard-blocks
   * tests below override this per-call to resolve `false` instead. */
  async function setup(): Promise<void> {
    keydownEvents$ = new Subject<{ key: string }>();
    backdropClick$ = new Subject<void>();
    dialogRef = {
      close: vi.fn(),
      keydownEvents: vi.fn().mockReturnValue(keydownEvents$),
      backdropClick: vi.fn().mockReturnValue(backdropClick$),
    };
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

  // C1 fix: `disableClose` is now fixed to `mode() === 'EDIT'` — NOT conditioned on
  // `formDirty()` anymore. This closes the race window (C1a) where a real user's
  // `dirtyChange` emission lands a tick after their first keystroke: `disableClose` now goes
  // true the instant EDIT starts, before the form can ever be dirty.
  it('sets MatDialogRef.disableClose as soon as EDIT starts, regardless of dirty state', async () => {
    await setup();

    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBeFalsy();

    component['enterEditMode']();
    fixture.detectChanges();
    await fixture.whenStable();
    // True immediately on entering EDIT — not gated on `formDirty()`.
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);

    // Staying dirty or clean while in EDIT makes no difference to disableClose anymore.
    component['onFormDirtyChange'](true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);

    component['onFormDirtyChange'](false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);
  });

  it('clears MatDialogRef.disableClose once EDIT is left (e.g. cancel confirmed)', async () => {
    await setup();

    component['enterEditMode']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);

    component['cancelEdit'](); // not dirty -> guard runs the action immediately
    fixture.detectChanges();
    await fixture.whenStable();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(false);
  });

  // C1 — ESC and backdrop must route through the same `guardDirty()`-backed `close()` path
  // as the "×" button, instead of `disableClose` merely swallowing the key/click with no
  // feedback (code review C1b) or leaving a race window before `formDirty` catches up (C1a).
  describe('C1 — ESC/backdrop route through close()/guardDirty()', () => {
    it('Escape while EDIT+dirty opens the discard-confirm dialog instead of doing nothing', async () => {
      await setup();

      component['enterEditMode']();
      component['onFormDirtyChange'](true);
      dialog.open.mockReturnValue({ afterClosed: () => of(false) }); // user cancels discard

      keydownEvents$.next({ key: 'Escape' });
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      // Still in EDIT — nothing was silently discarded, and the modal did not just ignore ESC.
      expect(component['mode']()).toBe('EDIT');
    });

    it('Escape while EDIT+dirty closes the dialog once the user confirms discard', async () => {
      await setup();

      component['enterEditMode']();
      component['onFormDirtyChange'](true);
      dialog.open.mockReturnValue({ afterClosed: () => of(true) }); // user confirms discard

      keydownEvents$.next({ key: 'Escape' });
      fixture.detectChanges();

      expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
    });

    it('other keys besides Escape are ignored by the keydownEvents subscription', async () => {
      await setup();

      component['enterEditMode']();
      component['onFormDirtyChange'](true);

      keydownEvents$.next({ key: 'Enter' });
      fixture.detectChanges();

      expect(dialog.open).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('backdrop click while EDIT+dirty routes through guardDirty(), not a silent no-op', async () => {
      await setup();

      component['enterEditMode']();
      component['onFormDirtyChange'](true);
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });

      backdropClick$.next();
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
    });

    it('Escape while not dirty (or not in EDIT) closes immediately without the confirm dialog', async () => {
      await setup();

      keydownEvents$.next({ key: 'Escape' });
      fixture.detectChanges();

      expect(dialog.open).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
    });

    // Bonus fix confirmed by the review: previously, saving (mutated=true) then leaving EDIT
    // and closing via ESC/backdrop (outside EDIT, disableClose was false) let Material close
    // with `undefined`, and the launcher's `?? { mutated: false }` fallback swallowed a real
    // `mutated: true`. Now ESC always goes through `close()`, which always reads the current
    // `mutated()` signal — so a save that already happened is never lost this way.
    it('Escape after a successful save (now VIEW mode) still reports mutated:true, not the launcher fallback', async () => {
      await setup();

      component['enterEditMode']();
      component['saveEdit']({ cost: 250 });
      httpMock.expectOne('/api/expenses/expense-1').flush({
        id: 'expense-1',
        name: 'Groceries',
        cost: 250,
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

      expect(component['mode']()).toBe('VIEW'); // save exits EDIT

      keydownEvents$.next({ key: 'Escape' });
      fixture.detectChanges();

      expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
    });
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
    // M2: `ExpenseResponseDto` never serializes `createdAt`/`updatedAt`, so there is no real
    // post-patch timestamp to show. `audit` is reset to `null` (hiding the footer) instead of
    // displaying the stale pre-patch value as if it were current.
    expect((detail as OmegaViewerExpenseDetail).audit).toBeNull();

    component['close']();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
  });

  // M2: the pre-patch detail in this block seeds `audit: null` already (see
  // `buildExpenseDetail`), so this test uses a non-null seed to prove the override actively
  // resets it rather than merely preserving an already-null value.
  it('saveEdit resets audit to null even when the pre-patch detail had a real audit value', async () => {
    keydownEvents$ = new Subject<{ key: string }>();
    backdropClick$ = new Subject<void>();
    dialogRef = {
      close: vi.fn(),
      keydownEvents: vi.fn().mockReturnValue(keydownEvents$),
      backdropClick: vi.fn().mockReturnValue(backdropClick$),
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

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
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          {
            provide: OmegaViewerService,
            useValue: {
              load: (): ReturnType<OmegaViewerService['load']> =>
                of(
                  buildExpenseDetail({
                    audit: { createdAt: '2026-01-01', updatedAt: '2026-01-01', deletedAt: null },
                  }),
                ),
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

    expect((component['readyDetail']() as OmegaViewerExpenseDetail).audit?.updatedAt).toBe(
      '2026-01-01',
    );

    component['enterEditMode']();
    component['saveEdit']({ cost: 250 });
    httpMock.expectOne('/api/expenses/expense-1').flush({
      id: 'expense-1',
      name: 'Groceries',
      cost: 250,
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

    // The stale pre-patch `updatedAt` must NOT survive into the post-save detail.
    expect((component['readyDetail']() as OmegaViewerExpenseDetail).audit).toBeNull();
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

  // C2 — a failed save must surface a visible message inside the still-open modal instead of
  // being dropped silently. Previously `error: () => this.saving.set(false)` discarded the
  // error entirely; nothing on screen told the user the save didn't happen.
  describe('C2 — save failure surfaces saveError instead of failing silently', () => {
    it('sets a generic saveError message on a generic (non-422) failure', async () => {
      await setup();

      component['enterEditMode']();
      expect(component['saveError']()).toBeNull();

      component['saveEdit']({ cost: 250 });
      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush('boom', { status: 500, statusText: 'Error' });
      fixture.detectChanges();

      expect(component['saveError']()).toBe(
        'Não foi possível salvar as alterações. Tente novamente.',
      );
      expect(component['saving']()).toBe(false);
      // Still in EDIT with the user's typed values intact — correct retry behavior, unchanged.
      expect(component['mode']()).toBe('EDIT');
    });

    it('sets a specific message for the 422 ExpenseCostBelowPaidAmountException case', async () => {
      await setup();

      component['enterEditMode']();
      component['saveEdit']({ cost: 5 });
      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush(
          {
            title: 'Expense cost below paid amount',
            detail: 'new cost is below the amount already paid',
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      fixture.detectChanges();

      expect(component['saveError']()).toBe(
        'O valor não pode ser menor que o quanto já foi pago nesta despesa.',
      );
    });

    it('renders the saveError inside the (still open) edit form with role="alert"', async () => {
      await setup();

      component['enterEditMode']();
      fixture.detectChanges();

      component['saveEdit']({ cost: 250 });
      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush('boom', { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const alert = root.querySelector('app-viewer-edit-form .ew-alert[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('Não foi possível salvar');
    });

    it('clears saveError at the start of the next save attempt', async () => {
      await setup();

      component['enterEditMode']();
      component['saveEdit']({ cost: 250 });
      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush('boom', { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(component['saveError']()).not.toBeNull();

      component['saveEdit']({ cost: 260 });
      expect(component['saveError']()).toBeNull();

      httpMock.expectOne('/api/expenses/expense-1').flush({
        id: 'expense-1',
        name: 'Groceries',
        cost: 260,
        remaining: 200,
        purchaseDate: '2026-07-01',
        walletId: 'wallet-1',
        creditCardId: 'card-1',
        installment: false,
        details: null,
      });
      fixture.detectChanges();

      expect(component['saveError']()).toBeNull();
    });

    it('clears saveError on cancelEdit (leaving EDIT)', async () => {
      await setup();

      component['enterEditMode']();
      component['saveEdit']({ cost: 250 });
      httpMock
        .expectOne('/api/expenses/expense-1')
        .flush('boom', { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(component['saveError']()).not.toBeNull();

      component['cancelEdit'](); // not dirty here -> guard runs immediately
      fixture.detectChanges();

      expect(component['saveError']()).toBeNull();
    });
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

describe('OmegaViewerComponent — notes section (F-08)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    keydownEvents: ReturnType<typeof vi.fn>;
    backdropClick: ReturnType<typeof vi.fn>;
  };

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
      details: 'Original note',
      tagIds: [],
      payerName: null,
      payments: [],
      installmentsRemaining: null,
      links: [],
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
      details: 'Read-only installment note',
      tagIds: [],
      payerName: null,
      progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
      payments: [],
      links: [],
      audit: null,
      ...overrides,
    };
  }

  function buildSubscriptionDetail(details: string | null = null): OmegaViewerDetail {
    return {
      kind: 'SUBSCRIPTION',
      ref: { kind: 'SUBSCRIPTION', id: 'subscription-1' },
      description: 'Netflix',
      currency: 'BRL',
      state: 'PRODUCTION',
      startMonth: '2026-01',
      endMonth: null,
      creditCardId: 'card-1',
      details,
      tagIds: [],
      payerName: null,
      links: [],
      audit: null,
    };
  }

  /** Stubs `OmegaViewerService.load()` to resolve whatever detail matches `initialRef.kind` —
   * lets a single `setup()` serve all 3 kinds by varying `initialRef`. */
  async function setup(initialRef: OmegaViewerRef, detail: OmegaViewerDetail): Promise<void> {
    dialogRef = {
      close: vi.fn(),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: initialRef },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          { provide: OmegaViewerService, useValue: { load: () => of(detail) } },
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

  it('renders the notes section for EXPENSE in VIEW mode', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-viewer-notes-section')).not.toBeNull();
    expect(root.textContent).toContain('Original note');
  });

  it('renders the notes section for SUBSCRIPTION with an editable Edit button', async () => {
    await setup({ kind: 'SUBSCRIPTION', id: 'subscription-1' }, buildSubscriptionDetail());

    const root = fixture.nativeElement as HTMLElement;
    const section = root.querySelector('app-viewer-notes-section');
    expect(section).not.toBeNull();
    expect(section?.querySelector('.vns__edit-btn')).not.toBeNull();
  });

  it('renders the notes section for INSTALLMENT as read-only (no Edit button)', async () => {
    await setup({ kind: 'INSTALLMENT', id: 'installment-1' }, buildInstallmentDetail());

    const root = fixture.nativeElement as HTMLElement;
    const section = root.querySelector('app-viewer-notes-section');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Read-only installment note');
    expect(section?.querySelector('.vns__edit-btn')).toBeNull();
    expect(section?.querySelector('textarea')).toBeNull();
  });

  it('hides the notes section while the shell is in full Expense EDIT mode', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['enterEditMode']();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-viewer-notes-section')).toBeNull();
  });

  it('saveNotes for EXPENSE calls ExpenseService.patch, layers the response, and sets mutated', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['saveNotes']('Updated note');

    const req = httpMock.expectOne('/api/expenses/expense-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ details: 'Updated note' });
    req.flush({
      id: 'expense-1',
      name: 'Groceries',
      cost: 100,
      remaining: 40,
      purchaseDate: '2026-07-01',
      walletId: 'wallet-1',
      creditCardId: 'card-1',
      installment: false,
      details: 'Updated note',
    });
    fixture.detectChanges();

    // Narrowed via 'details' in — the union's RESERVED_BUDGET_MIGRATION member (RBM-F14) has no
    // details field at all, so a plain optional-chained read no longer type-checks on the union.
    const readyDetail = component['readyDetail']();
    expect(readyDetail && 'details' in readyDetail ? readyDetail.details : undefined).toBe(
      'Updated note',
    );
    expect(component['notesSaving']()).toBe(false);
    // `mutated` is private — observed indirectly via close()'s result payload.
    component['close']();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
  });

  it('saveNotes for SUBSCRIPTION calls SubscriptionService.update and layers the response', async () => {
    await setup({ kind: 'SUBSCRIPTION', id: 'subscription-1' }, buildSubscriptionDetail());

    component['saveNotes']('Sub note');

    const req = httpMock.expectOne('/api/subscriptions/subscription-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ details: 'Sub note' });
    req.flush({
      id: 'subscription-1',
      description: 'Netflix',
      currency: 'BRL',
      state: 'PRODUCTION',
      flag: 'NONE',
      startMonth: '2026-01',
      endMonth: null,
      versions: [],
      creditCardId: 'card-1',
      details: 'Sub note',
    });
    fixture.detectChanges();

    const readyDetail = component['readyDetail']();
    expect(readyDetail && 'details' in readyDetail ? readyDetail.details : undefined).toBe(
      'Sub note',
    );
    expect(component['notesSaving']()).toBe(false);
  });

  it('saveNotes surfaces a notesSaveError on failure without touching the full-edit saveError', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['saveNotes']('Updated note');
    httpMock
      .expectOne('/api/expenses/expense-1')
      .flush('boom', { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(component['notesSaveError']()).toBe(
      'Não foi possível salvar as alterações. Tente novamente.',
    );
    expect(component['saveError']()).toBeNull();
    expect(component['notesSaving']()).toBe(false);
  });

  it('disableClose is set while notesEditing is true, even though mode() stays VIEW', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['onNotesEditingChange'](true);
    fixture.detectChanges();

    expect(component['mode']()).toBe('VIEW');
    expect(dialogRef).toBeDefined();
    // `dialogRef.disableClose` is set on the injected `MatDialogRef` mock object itself.
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);
  });

  // M1 fix: `notesDirty` alone must NOT drive `disableClose` anymore — that was the race
  // window the fix closed (ESC could slip through in the tick between the user's first
  // keystroke and `dirtyChange(true)` landing here). Only `notesEditing` (coarse, fires the
  // instant the form opens) may drive it now.
  it('disableClose stays false when only notesDirty (not notesEditing) is set — M1 regression guard', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['onNotesDirtyChange'](true);
    fixture.detectChanges();

    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(false);
  });

  it('disableClose clears once notes editing closes (editingChange(false)), independent of notesDirty', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['onNotesEditingChange'](true);
    fixture.detectChanges();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true);

    component['onNotesEditingChange'](false);
    fixture.detectChanges();
    expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(false);
  });

  it('guardDirty blocks navigateTo while notes are dirty and the user cancels the discard dialog', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    component['onNotesDirtyChange'](true);
    component['navigateTo']({ kind: 'INSTALLMENT', id: 'installment-1' });
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalled();
    expect(component['current']()).toEqual({ kind: 'EXPENSE', id: 'expense-1' });
  });

  it('guardDirty allows close() through once notes are no longer dirty', async () => {
    await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

    component['onNotesDirtyChange'](true);
    component['onNotesDirtyChange'](false);
    component['close']();

    expect(dialogRef.close).toHaveBeenCalled();
  });

  // s1 (code review): the tests above all drive `notesDirty` via the shell's own
  // `onNotesDirtyChange()` handler directly, bypassing `ViewerNotesSectionComponent` entirely
  // — which means the section's destruction (the actual root cause of C1) was never exercised.
  // These 4 cases interact with the rendered `<textarea>` for real, exactly like the reviewer
  // asked for.
  describe('C1/M1/M2 — real note editing composed with enterEditMode (code review)', () => {
    function typeIntoNotesTextarea(root: HTMLElement, value: string): void {
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = value;
      textarea.dispatchEvent(new Event('input'));
    }

    it('1) a dirty note + clicking "Editar" on the title opens the discard-confirm dialog instead of destroying the note', async () => {
      await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());
      dialog.open.mockReturnValue({ afterClosed: () => of(false) }); // user cancels discard

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      typeIntoNotesTextarea(root, 'A note in progress');
      fixture.detectChanges();
      expect(component['notesDirty']()).toBe(true);

      root.querySelector<HTMLButtonElement>('.ovw__edit-btn')?.click();
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalled();
      // Full-edit was NOT entered directly — the guard intercepted it.
      expect(component['mode']()).toBe('VIEW');
      expect(root.querySelector('app-viewer-notes-section')).not.toBeNull();
    });

    it('2) cancelling the discard dialog leaves the note dirty and still editable — nothing was discarded', async () => {
      await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());
      dialog.open.mockReturnValue({ afterClosed: () => of(false) }); // user cancels discard

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      typeIntoNotesTextarea(root, 'A note in progress');
      fixture.detectChanges();

      root.querySelector<HTMLButtonElement>('.ovw__edit-btn')?.click();
      fixture.detectChanges();

      expect(component['notesDirty']()).toBe(true);
      expect(component['mode']()).toBe('VIEW');
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.value).toBe('A note in progress');
    });

    it('3) confirming the discard dialog clears notesDirty AND does not leave the discarded text visible afterward', async () => {
      await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());
      dialog.open.mockReturnValue({ afterClosed: () => of(true) }); // user confirms discard

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      typeIntoNotesTextarea(root, 'Text that will be discarded');
      fixture.detectChanges();

      root.querySelector<HTMLButtonElement>('.ovw__edit-btn')?.click();
      fixture.detectChanges();

      // C1: notesDirty is not left stuck true.
      expect(component['notesDirty']()).toBe(false);
      // Full edit was entered as requested.
      expect(component['mode']()).toBe('EDIT');

      // Leave full-edit again (not dirty, guard passes straight through) and confirm the notes
      // section — if still rendered — shows neither an open textarea nor the discarded text
      // (proof of the M2 fix: resetEdit() actually cleared the child's local form).
      component['cancelEdit']();
      fixture.detectChanges();

      const section = root.querySelector('app-viewer-notes-section');
      expect(section).not.toBeNull();
      expect(section?.querySelector('textarea')).toBeNull();
      expect(section?.textContent).not.toContain('Text that will be discarded');
    });

    it('4) a note dirty via the real textarea, then the section destroyed WITHOUT going through guardDirty (mode.set direct) still self-clears notesDirty via the shell\'s defensive viewChild effect', async () => {
      await setup({ kind: 'EXPENSE', id: 'expense-1' }, buildExpenseDetail());

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      typeIntoNotesTextarea(root, 'Note lost when the section is torn down');
      fixture.detectChanges();
      expect(component['notesDirty']()).toBe(true);

      // Bypasses guardDirty entirely (unlike enterEditMode()) to isolate the DEFENSIVE fix: the
      // shell's `notesSection` viewChild effect noticing the section vanished from the DOM and
      // self-healing `notesDirty`/`notesEditing`, independent of the shell's guard ever
      // running. This is what protects any FUTURE path that destroys the section without going
      // through guardDirty first (the exact fragility the reviewer flagged).
      component['mode'].set('EDIT');
      fixture.detectChanges();

      expect(root.querySelector('app-viewer-notes-section')).toBeNull();
      expect(component['notesDirty']()).toBe(false);
      expect((dialogRef as unknown as { disableClose?: boolean }).disableClose).toBe(true); // still true — mode() is EDIT
    });
  });
});

describe('OmegaViewerComponent — payments section revert (F-10)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    keydownEvents: ReturnType<typeof vi.fn>;
    backdropClick: ReturnType<typeof vi.fn>;
  };

  function buildPayment(overrides: Partial<OmegaViewerPayment> = {}): OmegaViewerPayment {
    return {
      id: 'payment-1',
      amount: 40,
      paymentDate: '2026-07-05T12:00:00Z',
      bulletId: 'bullet-1',
      bulletDescription: 'Salary bullet',
      reversal: false,
      reversed: false,
      payerIds: ['payer-1'],
      kind: 'NORMAL',
      ...overrides,
    };
  }

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
      payments: [buildPayment()],
      installmentsRemaining: null,
      links: [],
      audit: null,
      ...overrides,
    };
  }

  let loadSpy: ReturnType<typeof vi.fn>;

  /** `dialog.open` defaults to resolving `afterClosed()` with `true` (user confirms the
   * revert) — same convention as the F-07/F-08 describe blocks above; tests that need to
   * exercise the "user cancels" path override this per-call.
   *
   * `OmegaViewerService.load` is stubbed with a spy (not a fixed `of(detail)`, unlike the
   * F-07/F-08 blocks above) because F-10's own "refetches the current item" acceptance
   * criterion needs to observe a SECOND `load()` call happening after `retry()` — a fixed
   * `of(detail)` stub can't distinguish "never refetched" from "refetched and got the same
   * static object back". `loadSpy` defaults to always resolving `detail`; tests that need the
   * second call to return different data override `loadSpy.mockReturnValueOnce(...)`.
   *
   * Code review C1: `mockImplementation(() => of({ ...detail }))`, NOT
   * `mockReturnValue(of(detail))` — the latter resolves every call with the exact SAME object
   * reference, which is what let the original C1 bug (`retry()` destroying an in-progress note
   * edit) hide from this entire describe block: `detailState` never appeared to "change
   * identity" between calls, so `ViewerNotesSectionComponent`'s re-seed effect never fired and
   * the destructive path was never exercised. A real `HttpClient` response is always a fresh
   * object per call — `mockImplementation` returning a new spread object every time matches
   * that and would have caught the regression before it shipped. */
  async function setup(detail: OmegaViewerDetail): Promise<void> {
    dialogRef = {
      close: vi.fn(),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    loadSpy = vi.fn().mockImplementation(() => of({ ...detail }));

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
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          { provide: OmegaViewerService, useValue: { load: loadSpy } },
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

  it('clicking Reverter opens the confirm dialog with the payment date', async () => {
    await setup(buildExpenseDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    const [, config] = dialog.open.mock.calls[0] as [unknown, { data: { dateLabel: string } }];
    expect(config.data.dateLabel).toBe('05/07/2026');
  });

  it('does NOT call PaymentService.revert when the user cancels the confirm dialog', async () => {
    await setup(buildExpenseDetail());
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
    fixture.detectChanges();

    httpMock.expectNone('/api/payments/payment-1/revert');
  });

  it('on confirm, calls POST /payments/:id/revert, refetches the current item via OmegaViewerService.load, and flags mutated', async () => {
    await setup(buildExpenseDetail());

    // The refetch (`retry()`) re-calls `OmegaViewerService.load()` for the SAME ref — stub the
    // second call to return a visibly different detail so the refetch is observable, not just
    // "load() was called again" but "the screen actually reflects the fresh trace".
    const refetchedDetail = buildExpenseDetail({
      payments: [buildPayment({ reversed: true }), buildPayment({ id: 'payment-2', reversal: true })],
    });
    loadSpy.mockReturnValueOnce(of(refetchedDetail));

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
    fixture.detectChanges();

    const revertReq = httpMock.expectOne('/api/payments/payment-1/revert');
    expect(revertReq.request.method).toBe('POST');
    expect(revertReq.request.body).toBeNull();
    revertReq.flush(
      { ...buildPayment({ id: 'payment-2', reversal: true }) },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();

    // Success refetches the CURRENT item's detail — no modal close, `load()` called a second
    // time for the same ref (not a savedOverride patch, the whole trace changed).
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(component['readyDetail']()?.kind).toBe('EXPENSE');
    expect(
      (component['readyDetail']() as OmegaViewerExpenseDetail | null)?.payments.length,
    ).toBe(2);
    expect(component['revertingId']()).toBeNull();

    component['close']();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
  });

  it('on 422 failure, surfaces a visible revertError inside the still-open modal (no silent failure)', async () => {
    await setup(buildExpenseDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
    fixture.detectChanges();

    httpMock
      .expectOne('/api/payments/payment-1/revert')
      .flush(
        { reason: 'SHARED_PAYMENT', paymentId: 'payment-1' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();

    expect(component['revertError']()).toBe(
      'Pagamentos compartilhados são revertidos pela tela de Share.',
    );
    expect(component['revertingId']()).toBeNull();

    const alert = root.querySelector('app-viewer-payments-section .ew-alert[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(
      'Pagamentos compartilhados são revertidos pela tela de Share.',
    );

    // Modal stays open — dialogRef.close was never called on failure.
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('does not flag mutated on a failed revert', async () => {
    await setup(buildExpenseDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
    fixture.detectChanges();

    httpMock
      .expectOne('/api/payments/payment-1/revert')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    component['close']();
    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
  });

  it('sets revertingId to the payment id while the request is in flight', async () => {
    await setup(buildExpenseDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
    fixture.detectChanges();

    expect(component['revertingId']()).toBe('payment-1');
    const button = root.querySelector<HTMLButtonElement>('.vps__revert-btn');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain('Revertendo...');

    httpMock
      .expectOne('/api/payments/payment-1/revert')
      .flush('boom', { status: 500, statusText: 'Server Error' });
  });

  it('does not render the payments section revert button for INSTALLMENT when ineligible, but still shows the hint', async () => {
    const installmentDetail: OmegaViewerInstallmentDetail = {
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
      payments: [buildPayment({ reversed: true })],
      links: [],
      audit: null,
    };

    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close: vi.fn(), keydownEvents: () => of(), backdropClick: () => of() } },
        { provide: MAT_DIALOG_DATA, useValue: { kind: 'INSTALLMENT', id: 'installment-1' } },
      ],
    });
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [{ provide: OmegaViewerService, useValue: { load: () => of(installmentDetail) } }],
      },
    });

    const installmentFixture = TestBed.createComponent(OmegaViewerComponent);
    installmentFixture.detectChanges();
    const installmentHttpMock = TestBed.inject(HttpTestingController);
    installmentHttpMock
      .expectOne('/api/credit-cards?page=0&size=100')
      .flush({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 });
    await installmentFixture.whenStable();
    installmentFixture.detectChanges();

    const root = installmentFixture.nativeElement as HTMLElement;
    expect(root.querySelector('.vps__revert-btn')).toBeNull();
    expect(root.querySelector('[data-testid="payment-ineligible-hint"]')).not.toBeNull();

    installmentHttpMock.verify({ ignoreCancelled: true });
  });

  // C1 (independent review, angular-arch): reproduces the bug empirically confirmed by the
  // reviewer — a note dirty via the REAL textarea, then a revert, used to destroy the note
  // silently because `revertPayment()`'s success handler called `retry()` directly instead of
  // going through `guardDirty()`. With `loadSpy` now returning a NEW object reference per call
  // (see the doc comment on `setup()` above), this is the scenario that would have exposed it.
  describe('C1 (code review) — revert composed with a dirty note in the SAME item', () => {
    function typeIntoNotesTextarea(root: HTMLElement, value: string): void {
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = value;
      textarea.dispatchEvent(new Event('input'));
    }

    it('blocks the revert BEFORE PaymentService.revert() is ever called when a note is dirty, and opens the discard-confirm dialog instead', async () => {
      await setup(buildExpenseDetail());
      // Every `dialog.open()` call (discard-confirm AND revert-confirm both go through the
      // same `MatDialog` mock) resolves `afterClosed()` with `false` — the user cancels
      // whichever dialog opens. If C1 were still broken, the revert-confirm dialog would open
      // and (irrelevant to this assertion either way) no request would fire on cancel; the
      // real proof is which dialog opens FIRST and that no revert request is sent at all.
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      typeIntoNotesTextarea(root, 'A note in progress, not yet saved');
      fixture.detectChanges();
      expect(component['notesDirty']()).toBe(true);

      root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
      fixture.detectChanges();

      // The guard's discard-confirm dialog fired — exactly one dialog, before any revert
      // request was ever sent.
      expect(dialog.open).toHaveBeenCalledTimes(1);
      httpMock.expectNone('/api/payments/payment-1/revert');

      // The note survived: still dirty, still showing what the user typed. Nothing was
      // silently destroyed.
      expect(component['notesDirty']()).toBe(true);
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.value).toBe('A note in progress, not yet saved');
    });

    it('confirming the discard dialog clears the dirty note, THEN opens the revert-confirm dialog, and only then calls PaymentService.revert()', async () => {
      await setup(buildExpenseDetail());
      dialog.open.mockReturnValue({ afterClosed: () => of(true) }); // confirms whichever dialog opens

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      typeIntoNotesTextarea(root, 'Text that will be discarded');
      fixture.detectChanges();
      expect(component['notesDirty']()).toBe(true);

      root.querySelector<HTMLButtonElement>('.vps__revert-btn')?.click();
      fixture.detectChanges();

      // Two dialogs in sequence: discard-confirm first (guard), revert-confirm second — both
      // routed through the same `MatDialog` mock, both auto-confirmed here.
      expect(dialog.open).toHaveBeenCalledTimes(2);
      expect(component['notesDirty']()).toBe(false);

      // Only NOW does the actual revert HTTP request go out — proving the guard ran to
      // completion (and the user confirmed discarding) BEFORE the write was ever dispatched.
      const revertReq = httpMock.expectOne('/api/payments/payment-1/revert');
      expect(revertReq.request.method).toBe('POST');
      revertReq.flush(
        { ...buildPayment({ id: 'payment-2', reversal: true }) },
        { status: 201, statusText: 'Created' },
      );
      fixture.detectChanges();

      expect(component['mutated']()).toBe(true);
    });

    it('a note dirty via mode()===EDIT (full Expense edit) also blocks the revert before dispatch — showPaymentsSection() already hides the button, but the guard still holds if that ever changes', async () => {
      await setup(buildExpenseDetail());
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.ovw__edit-btn')?.click();
      fixture.detectChanges();

      // M1: showPaymentsSection() now folds in mode() === 'VIEW', so the revert button is not
      // even rendered while full-edit is open — confirms the structural guarantee directly.
      expect(root.querySelector('.vps__revert-btn')).toBeNull();
      expect(component['mode']()).toBe('EDIT');

      // Defense in depth: even calling the handler directly (as if the button were reachable)
      // still routes through guardDirty() and blocks before any HTTP call, because mode() ===
      // 'EDIT' with a dirty form satisfies the same guard condition.
      component['onFormDirtyChange'](true);
      const payment = buildExpenseDetail().payments[0];
      component['requestRevertPayment'](payment);
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalledTimes(1);
      httpMock.expectNone('/api/payments/payment-1/revert');
    });
  });
});

/**
 * F-17 — end-to-end integration + accessibility walkthrough.
 *
 * Everything above this point tests one feature (F-06..F-10) at a time — this block
 * deliberately does NOT repeat any of that per-feature coverage. Instead it composes several
 * features together the way a real user actually drives the shell in one sitting: multi-hop
 * navigation, a dirty-guard triggered through a DIFFERENT exit path than the ones already
 * covered above, mode-reset on BOTH ends of a flip (not just the destination), a full
 * launcher→dialog→revert→refetch→close round trip asserting the propagated `OmegaViewerResult`,
 * and a keyboard-only walkthrough asserting focus never gets lost across the whole sequence.
 */
describe('OmegaViewerComponent — end-to-end integration + accessibility (F-17)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    keydownEvents: ReturnType<typeof vi.fn>;
    backdropClick: ReturnType<typeof vi.fn>;
  };

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
      payments: [],
      // Back-link to the source Expense AND a 3rd hop the multi-hop test walks into, so
      // navigation exercises more than a simple 2-item ping-pong.
      links: [
        { ref: { kind: 'EXPENSE', id: 'expense-1' }, label: 'Groceries' },
        { ref: { kind: 'SUBSCRIPTION', id: 'subscription-1' }, label: 'Netflix' },
      ],
      audit: null,
      ...overrides,
    };
  }

  function buildSubscriptionDetail(): OmegaViewerDetail {
    return {
      kind: 'SUBSCRIPTION',
      ref: { kind: 'SUBSCRIPTION', id: 'subscription-1' },
      description: 'Netflix',
      currency: 'BRL',
      state: 'PRODUCTION',
      startMonth: '2026-01',
      endMonth: null,
      creditCardId: 'card-1',
      details: null,
      tagIds: [],
      payerName: null,
      links: [],
      audit: null,
    };
  }

  // Not exercised by this block's own walk (Expense -> Installment -> Subscription -> Back ->
  // Back) — added only to keep the switch below exhaustive without a `default:`.
  function buildReservedBudgetMigrationDetail(): OmegaViewerDetail {
    return {
      kind: 'RESERVED_BUDGET_MIGRATION',
      ref: { kind: 'RESERVED_BUDGET_MIGRATION', id: 'eb-1' },
      extraBudgetId: 'eb-1',
      reservedBudgetId: 'rb-1',
      reservedBudgetDescription: 'Vacation fund',
      bulletId: 'bullet-1',
      bulletDescription: 'Groceries',
      amount: 500,
      currency: 'BRL',
      effectiveMonth: '2026-08',
      description: null,
      revertable: true,
      reverted: false,
      links: [],
      audit: null,
    };
  }

  /** Stubs `OmegaViewerService.load()` by ref.kind, exactly like the F-11 block above — lets a
   * click-driven walk (Expense -> Installment -> Subscription -> Back -> Back) resolve every
   * hop without hand-wiring one HTTP flush per navigation. */
  async function setup(): Promise<void> {
    dialogRef = {
      close: vi.fn(),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

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
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          {
            provide: OmegaViewerService,
            useValue: {
              load: (ref: OmegaViewerRef): ReturnType<OmegaViewerService['load']> => {
                switch (ref.kind) {
                  case 'EXPENSE':
                    return of(buildExpenseDetail());
                  case 'INSTALLMENT':
                    return of(buildInstallmentDetail());
                  case 'SUBSCRIPTION':
                    return of(buildSubscriptionDetail());
                  case 'RESERVED_BUDGET_MIGRATION':
                    return of(buildReservedBudgetMigrationDetail());
                }
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

  // This block has the heaviest nav-driven HTTP traffic in the file (multi-hop navigation,
  // repeated flips, edit-save round trips) — verify every request issued during a test was
  // actually flushed/expected, same as the real-dialog F-17 block below (see its own
  // `afterEach`). `ignoreCancelled` matches that block too: `switchMap`-driven navigation here
  // can leave an in-flight detail request cancelled by the next hop, which is expected
  // behavior, not a leak.
  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  function title(root: HTMLElement): string | undefined {
    return root.querySelector('.ovw__item-title')?.textContent?.trim();
  }

  function linkRowFor(root: HTMLElement, label: string): HTMLButtonElement | null {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('.ovw__link-row')).find((btn) =>
      btn.textContent?.includes(label),
    ) ?? null;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('1) multi-hop navigation — no state leaks across items', () => {
    it('Expense -> Installment -> Subscription -> Back -> Back -> close walks the stack correctly at every step', async () => {
      await setup();
      const root = fixture.nativeElement as HTMLElement;

      expect(title(root)).toBe('Groceries');
      expect(component['canGoBack']()).toBe(false);

      // Hop 1: Expense -> Installment.
      linkRowFor(root, 'Laptop')?.click();
      await settle();
      expect(title(root)).toBe('Laptop');
      expect(component['canGoBack']()).toBe(true);
      expect(component['history']()).toEqual([
        { kind: 'EXPENSE', id: 'expense-1' },
        { kind: 'INSTALLMENT', id: 'installment-1' },
      ]);

      // Hop 2: Installment -> Subscription, a 3rd distinct item, not a bounce back to Expense.
      linkRowFor(root, 'Netflix')?.click();
      await settle();
      expect(title(root)).toBe('Netflix');
      expect(component['history']()).toEqual([
        { kind: 'EXPENSE', id: 'expense-1' },
        { kind: 'INSTALLMENT', id: 'installment-1' },
        { kind: 'SUBSCRIPTION', id: 'subscription-1' },
      ]);

      // Back #1: pops Subscription, lands on Installment — no leftover Subscription state
      // (e.g. its empty `links`) bleeding into what renders for Installment.
      root.querySelector<HTMLButtonElement>('.ovw__back')?.click();
      await settle();
      expect(title(root)).toBe('Laptop');
      expect(linkRowFor(root, 'Groceries')).not.toBeNull();
      expect(linkRowFor(root, 'Netflix')).not.toBeNull();
      expect(component['history']()).toEqual([
        { kind: 'EXPENSE', id: 'expense-1' },
        { kind: 'INSTALLMENT', id: 'installment-1' },
      ]);

      // Back #2: pops Installment, lands back on the original Expense.
      root.querySelector<HTMLButtonElement>('.ovw__back')?.click();
      await settle();
      expect(title(root)).toBe('Groceries');
      expect(component['canGoBack']()).toBe(false);
      expect(component['history']()).toEqual([{ kind: 'EXPENSE', id: 'expense-1' }]);

      // Close: the stack is fully unwound, nothing left to guard.
      component['close']();
      expect(dialogRef.close).toHaveBeenCalledWith({ mutated: false });
    });

    it('each hop issues its own fresh detail resolution — no stale item briefly renders mid-flip', async () => {
      await setup();
      const root = fixture.nativeElement as HTMLElement;

      linkRowFor(root, 'Laptop')?.click();
      await settle();
      linkRowFor(root, 'Netflix')?.click();
      await settle();

      // Field rows reflect Subscription (Netflix), not a leftover Installment/Expense field —
      // proof `fieldRows`/`readyDetail` recompute cleanly on every hop instead of merging state.
      expect(root.textContent).not.toContain('Laptop');
      expect(root.querySelector('.ovw__item-title')?.textContent?.trim()).toBe('Netflix');
    });
  });

  describe('2) dirty guard composed across features — note dirty blocks real navigation, not just entering edit mode', () => {
    it('editing a note (unsaved) then clicking a link-navigation row opens the discard-confirm dialog and blocks the flip', async () => {
      await setup();
      dialog.open.mockReturnValue({ afterClosed: () => of(false) }); // user cancels discard
      const root = fixture.nativeElement as HTMLElement;

      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Unsaved note, about to try navigating away';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component['notesDirty']()).toBe(true);

      // The real link-navigation row, not a direct navigateTo() call — this is the composed
      // path the plan explicitly calls out (dirty note + real navigation, not just entering
      // full-edit, which the F-08 block already covers).
      linkRowFor(root, 'Laptop')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledTimes(1);
      // Still on the original Expense — the flip never happened.
      expect(title(root)).toBe('Groceries');
      expect(component['current']()).toEqual({ kind: 'EXPENSE', id: 'expense-1' });
      expect(component['notesDirty']()).toBe(true);
      expect((root.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
        'Unsaved note, about to try navigating away',
      );
    });

    it('confirming the discard dialog lets the same navigation through and clears the note', async () => {
      await setup();
      dialog.open.mockReturnValue({ afterClosed: () => of(true) }); // user confirms discard
      const root = fixture.nativeElement as HTMLElement;

      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'About to be discarded';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      linkRowFor(root, 'Laptop')?.click();
      await settle();

      expect(title(root)).toBe('Laptop');
      expect(component['notesDirty']()).toBe(false);
    });

    it('the same dirty note also blocks Back (goBack), not only forward navigation', async () => {
      await setup();
      const root = fixture.nativeElement as HTMLElement;

      // Hop to the Subscription (Installment notes are read-only per F-08, so dirtying a note
      // ON the item Back is invoked from needs an editable-notes kind — Expense or
      // Subscription) via Installment first, matching the rest of this describe block's
      // multi-hop shape.
      linkRowFor(root, 'Laptop')?.click();
      await settle();
      linkRowFor(root, 'Netflix')?.click();
      await settle();
      expect(title(root)).toBe('Netflix');

      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Dirty on the Subscription item';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component['notesDirty']()).toBe(true);

      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      root.querySelector<HTMLButtonElement>('.ovw__back')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledTimes(1);
      expect(title(root)).toBe('Netflix'); // Back never actually happened.
      expect(component['canGoBack']()).toBe(true);
      expect(component['notesDirty']()).toBe(true);
    });
  });

  describe('3) mode resets on BOTH ends of a flip, not only the destination', () => {
    it('EDIT on an Expense reached via navigateTo (not the initial item) -> Back -> goBack() itself resets mode to VIEW on the item it pops back to', async () => {
      await setup();
      const root = fixture.nativeElement as HTMLElement;

      // Hop away from the initial Expense first: Expense -> Installment. `mode` is VIEW on
      // both ends of this hop already (Installment isn't EDIT-capable), so by the time we
      // reach the assertions below, `mode` did NOT start this test as VIEW-via-navigateTo —
      // it will be driven to EDIT independently, on the item `goBack()` pops BACK TO.
      linkRowFor(root, 'Laptop')?.click();
      await settle();
      expect(title(root)).toBe('Laptop');

      // From Installment, flip to the Expense (its own link row points back at it) and enter
      // EDIT there. This Expense is now a NON-initial stack entry: unlike the old version of
      // this test (which entered EDIT on the item the shell opened with, then relied on
      // `navigateTo()`'s own reset to already clear it before Back ever ran), `mode` here is
      // still `'EDIT'` at the moment `.ovw__back` is pressed below — nothing else has reset
      // it in between. That makes the coming assertion sensitive to `goBack()`'s OWN
      // `leaveEditMode()` call specifically (proven via mutation: deleting `leaveEditMode()`
      // from `goBack()` alone, while `navigateTo()` keeps its own call, fails this test; the
      // previous version of this test kept passing under that exact mutation because
      // `navigateTo()` had already reset mode to VIEW before Back was ever pressed).
      linkRowFor(root, 'Groceries')?.click();
      await settle();
      expect(title(root)).toBe('Groceries');

      root.querySelector<HTMLButtonElement>('.ovw__edit-btn')?.click();
      fixture.detectChanges();
      expect(component['mode']()).toBe('EDIT');
      expect(root.querySelector('app-viewer-edit-form')).not.toBeNull();

      // The shell's own template swaps the ENTIRE body (including the link-navigation rows)
      // for `ViewerEditFormComponent` while `mode() === 'EDIT'` — see the shell's `@else`
      // branch in `omega-viewer.component.html`. There is genuinely no link row or Back
      // button a real user could click right now (the header's `.ovw__back` is still present,
      // but exercising it here would go through the DOM anyway — see below). Calling
      // `goBack()` directly on the component matches how every other programmatic-path test
      // in this spec file already drives `navigateTo`/`goBack` where the assertion cares
      // about the method's own effect, not the surrounding click plumbing.
      component['goBack']();
      await settle();

      // Popping back to Installment must land in VIEW — this is `goBack()`'s OWN reset, not
      // a residual VIEW state left over from `navigateTo()` (see mutation-testing note above).
      expect(title(root)).toBe('Laptop');
      expect(component['mode']()).toBe('VIEW');
      expect(root.querySelector('app-viewer-edit-form')).toBeNull();
    });
  });

  describe('4) focus-management / activation walkthrough — every interactive element is natively keyboard-activatable, focus never lost across the sequence', () => {
    /**
     * IMPORTANT — what this helper does NOT prove: jsdom does not implement the native
     * user-agent default action of a focused `<button>`/`<input type=submit>` firing a
     * `click` on Enter/Space (no polyfill for that exists in this project's test setup), so a
     * synthetic `keydown` `KeyboardEvent` dispatched here is inert on its own — there are zero
     * `keydown`/`keyup`/`keypress` handlers anywhere in the omega-viewer templates or
     * component. A prior version of this test dispatched `keydown` and then ALSO called
     * `.click()` on the element, and asserted on the result — which made the assertions pass
     * regardless of whether the `keydown` dispatch did anything at all (confirmed via
     * mutation: deleting the `dispatchEvent(keydown)` line left all tests passing; the
     * `.click()` call alone did 100% of the work). That claimed a keyboard-only guarantee the
     * test never actually provided.
     *
     * What genuinely guarantees Enter/Space activation in a REAL browser is the element being
     * a native, non-disabled `<button>` (or `<input type="submit">`/`<button type="submit">`
     * inside a `<form>`) — the browser's own default action handles the rest; jsdom's gap is a
     * jsdom limitation, not a signal that the app is missing anything. So this test asserts
     * BOTH: (a) native activatability of every element in the walkthrough — real button tag,
     * not disabled, correct `type` — which is what actually guarantees keyboard behavior
     * outside jsdom, and (b) the walkthrough's genuinely-provable contract: focus management
     * across the whole sequence (F-11's "focus lands on the new title on every flip"), which
     * mutation-testing confirmed IS load-bearing (removing `titleRef().focus()` calls from the
     * component fails this test). `.click()` is used directly to drive the flow, same as every
     * other DOM-interaction test in this file — no longer dressed up as a `keydown` dispatch.
     */
    function assertNativelyActivatable(el: HTMLElement | null): asserts el is HTMLButtonElement {
      expect(el).not.toBeNull();
      expect(el).toBeInstanceOf(HTMLButtonElement);
      const button = el as HTMLButtonElement;
      // A native, non-disabled <button> is activated by both Enter and Space via the
      // browser's own default action on keydown/keyup — no app-level key handler required.
      expect(button.disabled).toBe(false);
      expect(button.tagName).toBe('BUTTON');
      expect(['button', 'submit']).toContain(button.type);
    }

    it('open -> flip on a link row -> Back -> Editar -> edit a field -> Save -> close via Escape, with every control natively keyboard-activatable and focus always landing somewhere sensible', async () => {
      await setup();
      const root = fixture.nativeElement as HTMLElement;

      // 1) Opened: initial title is focusable-adjacent (F-11 lands focus on the heading even
      // on first load's re-render path) — assert we start from a known, sane focus baseline
      // before doing anything.
      expect(title(root)).toBe('Groceries');

      // 2) Flip on the Expense -> Installment link row — assert it's a real, enabled <button>
      // (guarantees Enter/Space activation in a real browser) before driving it.
      const linkRow = linkRowFor(root, 'Laptop');
      assertNativelyActivatable(linkRow);
      linkRow.click();
      await settle();

      expect(title(root)).toBe('Laptop');
      // F-11's contract: focus lands on the new item's title heading after every flip.
      expect(document.activeElement).toBe(root.querySelector('.ovw__item-title'));

      // 3) Back on the Back button.
      const backBtn = root.querySelector<HTMLButtonElement>('.ovw__back');
      assertNativelyActivatable(backBtn);
      backBtn.click();
      await settle();

      expect(title(root)).toBe('Groceries');
      expect(document.activeElement).toBe(root.querySelector('.ovw__item-title'));

      // 4) Enter EDIT mode via "Editar".
      const editBtn = root.querySelector<HTMLButtonElement>('.ovw__edit-btn');
      assertNativelyActivatable(editBtn);
      editBtn.click();
      fixture.detectChanges();

      expect(component['mode']()).toBe('EDIT');
      const nameInput = root.querySelector<HTMLInputElement>('#vef-name');
      expect(nameInput).not.toBeNull();
      // Editing a field itself is real keyboard input, not a mouse action — Tab from Editar
      // into the form's first field, then type.
      nameInput?.focus();
      expect(document.activeElement).toBe(nameInput);
      (nameInput as HTMLInputElement).value = 'Groceries (edited)';
      nameInput?.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component['formDirty']()).toBe(true);

      // 5) Save — a real submit button inside a <form>, so Enter from any field in the form
      // (not just the button itself) also submits it via the browser's native form-submit
      // default action, on top of the button's own Enter/Space activation.
      const saveBtn = root.querySelector<HTMLButtonElement>('.vef__actions .ew-btn--primary');
      assertNativelyActivatable(saveBtn);
      expect(saveBtn.type).toBe('submit');
      expect(saveBtn.closest('form')).not.toBeNull();
      saveBtn.focus();
      expect(document.activeElement).toBe(saveBtn);
      saveBtn.click();
      fixture.detectChanges();

      const patchReq = httpMock.expectOne('/api/expenses/expense-1');
      expect(patchReq.request.method).toBe('PATCH');
      patchReq.flush({
        id: 'expense-1',
        name: 'Groceries (edited)',
        cost: 100,
        remaining: 40,
        purchaseDate: '2026-07-01',
        walletId: 'wallet-1',
        creditCardId: 'card-1',
        installment: false,
        details: null,
      });
      await settle();

      expect(component['mode']()).toBe('VIEW');
      expect(component['mutated']()).toBe(true);

      // 6) Close via Escape — routed through the shell's own keydownEvents()/close() path
      // (C1), exercised here via the same Subject the dialogRef stub exposes, since Escape on
      // a MatDialog is normally a document-level listener Angular Material owns, not a DOM
      // keydown the dialog's OWN template branches on.
      component['close']();
      expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
    });
  });
});

/**
 * F-17 (part 2) — revert -> refetch -> `mutated` propagation through the FULL launcher flow.
 *
 * Separate `describe` block, deliberately not sharing the `setup()` above: this one drives
 * `OmegaViewerLauncher.open(...)` end-to-end with a REAL `MatDialog` (only `provideNoopAnimations`
 * stubbed in, no dialog mock) so the assertion is on `OmegaViewerResult` as it comes back out of
 * `.subscribe()`, exactly how every host page (Expense/Installment/Subscription) actually
 * consumes it — not on the shell component's internal `mutated` signal in isolation, which the
 * F-10 block above already covers.
 */
describe('OmegaViewerComponent — revert -> refetch -> mutated propagation via the real launcher (F-17)', () => {
  let launcher: OmegaViewerLauncher;
  let httpMock: HttpTestingController;

  function buildPayment(overrides: Partial<OmegaViewerPayment> = {}): OmegaViewerPayment {
    return {
      id: 'payment-1',
      amount: 40,
      paymentDate: '2026-07-05T12:00:00Z',
      bulletId: 'bullet-1',
      bulletDescription: 'Salary bullet',
      reversal: false,
      reversed: false,
      payerIds: ['payer-1'],
      kind: 'NORMAL',
      ...overrides,
    };
  }

  let appRef: ApplicationRef;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    });
    launcher = TestBed.inject(OmegaViewerLauncher);
    httpMock = TestBed.inject(HttpTestingController);
    appRef = TestBed.inject(ApplicationRef);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('open().subscribe(result => ...) reports mutated:true after a revert, once the dialog is closed', async () => {
    const results: OmegaViewerResult[] = [];
    launcher.open({ kind: 'EXPENSE', id: 'expense-1' }).subscribe((result) => results.push(result));

    // The launcher's dynamic import() + BreakpointObserver.observe() resolve asynchronously —
    // poll for the viewer's own first HTTP request instead of assuming a fixed tick count.
    // `waitUntilRequestMade` returns the already-matched `TestRequest` (via `expectOne`, which
    // removes it from the pending queue as a side effect) so it can be flushed directly here —
    // calling `expectOne` on the same URL a second time would otherwise fail with "no matching
    // request", since the request was already consumed by the wait itself.
    const viewerReq = await waitUntilRequestMade(httpMock, '/api/viewer/expenses/expense-1');

    httpMock.expectOne('/api/credit-cards?page=0&size=100').flush({
      content: [],
      page: 0,
      size: 100,
      totalElements: 0,
      totalPages: 0,
    });
    viewerReq.flush({
      id: 'expense-1',
      name: 'Groceries',
      cost: 100,
      remaining: 40,
      purchaseDate: '2026-07-01',
      walletId: 'wallet-1',
      creditCardId: null,
      flag: 'NONE',
      hidden: false,
      details: null,
      createdAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-07-01T10:00:00Z',
      tags: [],
      paymentTrace: [buildPayment()],
      refs: [],
    } satisfies ExpenseViewerResponseDto);
    await flushMicrotasks(appRef);

    const root = document.body;
    const revertBtn = root.querySelector<HTMLButtonElement>('.vps__revert-btn');
    expect(revertBtn).not.toBeNull();
    revertBtn?.click();
    await flushMicrotasks(appRef);

    // The revert-confirm dialog (real MatDialog, real ViewerRevertConfirmDialogComponent) is
    // now open in the DOM — confirm it via its real "Reverter pagamento" action button, no
    // dialog mock. Selected by class, not text: the button also contains a `mat-icon`, so its
    // `textContent` is "undoReverter pagamento", not an exact match.
    const confirmBtn = root.querySelector<HTMLButtonElement>('.vrc-confirm-btn');
    expect(confirmBtn).not.toBeNull();
    confirmBtn?.click();
    await flushMicrotasks(appRef);

    httpMock.expectOne('/api/payments/payment-1/revert').flush(
      { ...buildPayment({ id: 'payment-2', reversal: true }) },
      { status: 201, statusText: 'Created' },
    );
    await flushMicrotasks(appRef);

    // Revert success triggers retry() -> a brand new GET for the same Expense ref.
    httpMock.expectOne('/api/viewer/expenses/expense-1').flush({
      id: 'expense-1',
      name: 'Groceries',
      cost: 100,
      remaining: 40,
      purchaseDate: '2026-07-01',
      walletId: 'wallet-1',
      creditCardId: null,
      flag: 'NONE',
      hidden: false,
      details: null,
      createdAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-07-01T10:00:00Z',
      tags: [],
      paymentTrace: [
        buildPayment({ reversed: true }),
        buildPayment({ id: 'payment-2', reversal: true }),
      ],
      refs: [],
    } satisfies ExpenseViewerResponseDto);
    await flushMicrotasks(appRef);

    // Close the dialog the same way a real user would — the "Fechar" footer action, which
    // routes through close() -> guardDirty() -> dialogRef.close({ mutated }).
    const closeBtn = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) => btn.textContent?.trim() === 'Fechar',
    );
    closeBtn?.click();
    await flushMicrotasks(appRef);

    // The assertion that matters for this task: mutated:true came out of the LAUNCHER's own
    // observable, exactly as ExpensePage/InstallmentPage/SubscriptionPage consume it — not a
    // read of the shell component's internal signal.
    expect(results).toEqual([{ mutated: true }]);
  });
});

/** Polls until a request to `url` has actually been issued, then returns it (already removed
 * from the pending queue by `expectOne`, ready to `.flush()`) — the launcher's dynamic
 * `import()` + `BreakpointObserver` resolve over an unpredictable number of
 * microtasks/macrotasks, so a fixed number of `await Promise.resolve()` calls is not reliable.
 * Callers must NOT call `expectOne(url)` again for the same request afterward — `expectOne`
 * removes it from the pending queue as a side effect on success, so this helper's own retry
 * loop only re-attempts after a *failed* `expectOne`. Note that "failed" doesn't mean nothing
 * was removed: internally `expectOne` calls `match()`, which SPLICES OUT every matching
 * request from the pending queue first and only THEN throws if the match count isn't exactly
 * 1 (zero matches: nothing to splice, throws empty-handed; more than one match: all matches
 * are already removed by the time it throws). Either way this helper's retry is safe — on the
 * zero-match case there's nothing to have lost, and the >1 case can't happen here since each
 * `url` this helper is called with is only ever issued once per test. */
async function waitUntilRequestMade(
  httpMock: HttpTestingController,
  url: string,
): Promise<TestRequest> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    try {
      return httpMock.expectOne(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw new Error(`Timed out waiting for a request to ${url}`);
}

// RBM-F16/F17 — revert entry point for the 4th kind, plus the coordination test that pins the
// single-write-path rule (rule 1): the shell must call ReservedBudgetService.deleteMigration(),
// never ExtraBudgetService.delete() directly.
describe('OmegaViewerComponent — reserved budget migration revert (RBM-F16)', () => {
  let fixture: ComponentFixture<OmegaViewerComponent>;
  let component: OmegaViewerComponent;
  let httpMock: HttpTestingController;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    keydownEvents: ReturnType<typeof vi.fn>;
    backdropClick: ReturnType<typeof vi.fn>;
  };
  let loadSpy: ReturnType<typeof vi.fn>;

  function buildMigrationDetail(
    overrides: Partial<OmegaViewerReservedBudgetMigrationDetail> = {},
  ): OmegaViewerReservedBudgetMigrationDetail {
    return {
      kind: 'RESERVED_BUDGET_MIGRATION',
      ref: { kind: 'RESERVED_BUDGET_MIGRATION', id: 'eb-1' },
      extraBudgetId: 'eb-1',
      reservedBudgetId: 'rb-1',
      reservedBudgetDescription: 'Vacation fund',
      bulletId: 'bullet-1',
      bulletDescription: 'Groceries',
      amount: 500,
      currency: 'BRL',
      effectiveMonth: '2026-08',
      description: null,
      revertable: true,
      reverted: false,
      links: [],
      audit: null,
      ...overrides,
    };
  }

  // Mirrors the F-10 payments block's own setup() doc comment: mockImplementation (a fresh
  // object per call), not mockReturnValue, so a refetch is observable as a real identity change
  // — and so a refetch that errors (404-after-revert) is distinguishable from "never refetched".
  async function setup(detail: OmegaViewerDetail): Promise<void> {
    dialogRef = {
      close: vi.fn(),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    loadSpy = vi.fn().mockImplementation(() => of({ ...detail }));

    TestBed.configureTestingModule({
      imports: [OmegaViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { kind: 'RESERVED_BUDGET_MIGRATION', id: 'eb-1' },
        },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    TestBed.overrideComponent(OmegaViewerComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialog },
          { provide: OmegaViewerService, useValue: { load: loadSpy } },
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

  it('canRevertMigration() is true only for the migration kind with revertable: true', async () => {
    await setup(buildMigrationDetail({ revertable: true }));
    expect(component['canRevertMigration']()).toBe(true);
  });

  it('canRevertMigration() is false for revertable: false', async () => {
    await setup(buildMigrationDetail({ revertable: false }));
    expect(component['canRevertMigration']()).toBe(false);
  });

  it('canRevertMigration() is false for the 3 old kinds (non-regression of the guard)', async () => {
    await setup({
      kind: 'EXPENSE',
      ref: { kind: 'EXPENSE', id: 'expense-1' },
      name: 'Groceries',
      cost: 100,
      remaining: 40,
      purchaseDate: '2026-07-01',
      creditCardId: null,
      details: null,
      tagIds: [],
      payerName: null,
      payments: [],
      installmentsRemaining: null,
      links: [],
      audit: null,
    });
    expect(component['canRevertMigration']()).toBe(false);
  });

  it('revertable: false renders the ineligible message, not a revert button', async () => {
    await setup(buildMigrationDetail({ revertable: false }));

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.ovw__migration-ineligible')).not.toBeNull();
    expect(root.querySelector('.ovw__migration-revert button')).toBeNull();
  });

  // Post-epic code review MAJOR 2: the ineligible copy must distinguish "already reverted" from
  // "bullet already spent it" — the two are genuinely different reasons, not one generic message.
  it('reverted: true renders "already undone" copy, not the "bullet spent it" copy', async () => {
    await setup(buildMigrationDetail({ revertable: false, reverted: true }));

    const root = fixture.nativeElement as HTMLElement;
    const message = root.querySelector('.ovw__migration-ineligible')?.textContent ?? '';
    expect(message).toContain('já foi desfeita');
    expect(message).not.toContain('já gastou o valor');
  });

  it('reverted: false (bullet already spent it) renders the spend-based copy', async () => {
    await setup(buildMigrationDetail({ revertable: false, reverted: false }));

    const root = fixture.nativeElement as HTMLElement;
    const message = root.querySelector('.ovw__migration-ineligible')?.textContent ?? '';
    expect(message).toContain('já gastou o valor');
    expect(message).not.toContain('já foi desfeita');
  });

  it('clicking Reverter opens the confirm dialog and does not call deleteMigration before confirmation', async () => {
    await setup(buildMigrationDetail());
    // afterClosed() stays open (never emits) until the test resolves it below — proves the
    // DELETE genuinely waits on the user's confirmation, not just "eventually fires".
    const confirmSubject = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => confirmSubject.asObservable() });

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__migration-revert button')?.click();
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    httpMock.expectNone(
      (req) => req.url === '/api/reserved-budgets/rb-1/migrations/eb-1' && req.method === 'DELETE',
    );

    confirmSubject.next(true);
    fixture.detectChanges();

    httpMock.expectOne(
      (req) => req.url === '/api/reserved-budgets/rb-1/migrations/eb-1' && req.method === 'DELETE',
    );
  });

  it('cancelling the confirm dialog calls no service', async () => {
    await setup(buildMigrationDetail());
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__migration-revert button')?.click();
    fixture.detectChanges();

    httpMock.expectNone(
      (req) => req.url === '/api/reserved-budgets/rb-1/migrations/eb-1' && req.method === 'DELETE',
    );
  });

  it('confirming calls ReservedBudgetService.deleteMigration(reservedBudgetId, extraBudgetId) — the ONE write path (RBM-F16 rule 1)', async () => {
    await setup(buildMigrationDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__migration-revert button')?.click();
    fixture.detectChanges();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/reserved-budgets/rb-1/migrations/eb-1' && r.method === 'DELETE',
    );
    expect(req.request.method).toBe('DELETE');

    // Coordination test (RBM-F16 rule 1): the ONLY write this flow may ever issue is the
    // reserved-budgets migrations DELETE above — never a direct ExtraBudget delete. If someone
    // "simplified" the shell by calling ExtraBudgetService.delete() straight, this assertion
    // fails because that second write path would appear here.
    httpMock.expectNone((r) => r.url.includes('/extra-budgets/') && r.method === 'DELETE');
  });

  it('the bodyOverride sent to the confirm dialog mentions amount, bullet, reserve, and month', async () => {
    await setup(buildMigrationDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__migration-revert button')?.click();
    fixture.detectChanges();

    const [, config] = dialog.open.mock.calls[0] as [
      unknown,
      { data: { bodyOverride?: string; dateLabel: string } },
    ];
    expect(config.data.bodyOverride).toContain('Groceries');
    expect(config.data.bodyOverride).toContain('Vacation fund');
    expect(config.data.dateLabel).toBe('Aug 2026');
  });

  it('on success, mutated is set and the viewer closes instead of showing a generic error (404-after-revert)', async () => {
    await setup(buildMigrationDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__migration-revert button')?.click();
    fixture.detectChanges();

    const deleteReq = httpMock.expectOne(
      (r) => r.url === '/api/reserved-budgets/rb-1/migrations/eb-1' && r.method === 'DELETE',
    );
    deleteReq.flush({});

    // The refetch triggered by retry() is expected to 404 — the migration itself is gone.
    loadSpy.mockReturnValueOnce(
      new Observable((subscriber) => subscriber.error(new Error('404'))),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialogRef.close).toHaveBeenCalledWith({ mutated: true });
  });

  it('on 409 MigrationNotReversibleException, shows an inline error and keeps the modal open (mutated stays false)', async () => {
    await setup(buildMigrationDetail());

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.ovw__migration-revert button')?.click();
    fixture.detectChanges();

    httpMock
      .expectOne(
        (r) => r.url === '/api/reserved-budgets/rb-1/migrations/eb-1' && r.method === 'DELETE',
      )
      .flush(
        { title: 'Migration not reversible', bulletId: 'bullet-1', remaining: 20, required: 100 },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(component['revertMigrationError']()).not.toBeNull();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});

/** Drains pending microtasks and forces an `ApplicationRef.tick()` between DOM interactions in
 * the real-`MatDialog` F-17 launcher test above — unlike every other block in this file, that
 * test never calls `ComponentFixture.detectChanges()` (there is no fixture; the viewer is a real
 * dialog opened by the real `MatDialog`, exactly as `OmegaViewerLauncher` opens it in
 * production), so change detection for the dynamically-created component needs to be driven
 * explicitly rather than via the usual fixture-bound helper. */
async function flushMicrotasks(appRef: ApplicationRef): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  appRef.tick();
}
