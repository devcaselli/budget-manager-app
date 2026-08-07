import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';

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

    expect(component['readyDetail']()?.details).toBe('Updated note');
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

    expect(component['readyDetail']()?.details).toBe('Sub note');
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
