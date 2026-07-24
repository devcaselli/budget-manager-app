import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import {
  ConfirmPendingReviewsResult,
  PendingReview,
  PendingReviewPatchRequest,
} from '../../models/pending-review';
import { PendingReviewService } from '../../services/pending-review.service';
import { PendingReviewPage } from './pending-review-page';

class FakePendingReviewService {
  readonly pendingReviews$ = new BehaviorSubject<readonly PendingReview[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);

  loadAll = vi.fn();
  patch = vi.fn<(id: string, request: PendingReviewPatchRequest) => Observable<PendingReview>>(() =>
    of(buildItem()),
  );
  discard = vi.fn<(id: string) => Observable<void>>(() => of(undefined));
  confirm = vi.fn<(ids: readonly string[]) => Observable<ConfirmPendingReviewsResult>>(() =>
    of({ confirmed: [], failed: [] }),
  );
}

function buildItem(overrides: Partial<PendingReview> = {}): PendingReview {
  return {
    id: 'pr-1',
    sourcePendingId: 'src-1',
    bank: 'Nubank',
    cardLast4: '1234',
    cardLabel: 'Nubank •1234',
    amount: 120.5,
    currency: 'BRL',
    merchant: 'RAW MERCHANT LTDA',
    purchaseAt: '2026-07-20T10:00:00Z',
    nameOverride: null,
    resolvedName: 'Supermercado',
    installmentNumber: null,
    status: 'PENDING_REVIEW',
    ...overrides,
  };
}

interface Internals {
  confirmErrorsById: () => ReadonlyMap<string, string>;
  confirmSummary: () => string | null;
  hasConfirmFailures: () => boolean;
  onRename: (event: { id: string; value: string }) => void;
  onToggleInstallment: () => void;
  onSetInstallmentNumber: (event: { id: string; value: number }) => void;
  onDiscard: (id: string) => void;
  onConfirmSelected: (ids: readonly string[]) => void;
}

describe('PendingReviewPage', () => {
  let fixture: ComponentFixture<PendingReviewPage>;
  let component: PendingReviewPage;
  let service: FakePendingReviewService;

  function api(): Internals {
    return component as unknown as Internals;
  }

  function createComponent(): void {
    TestBed.configureTestingModule({
      imports: [PendingReviewPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PendingReviewService, useValue: service },
      ],
    });

    fixture = TestBed.createComponent(PendingReviewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = new FakePendingReviewService();
  });

  it('calls loadAll() when the service has no data yet', () => {
    createComponent();

    expect(service.loadAll).toHaveBeenCalledTimes(1);
  });

  it('does not call loadAll() when the service already has data (e.g. from a recent sync)', () => {
    service.pendingReviews$.next([buildItem()]);
    createComponent();

    expect(service.loadAll).not.toHaveBeenCalled();
  });

  it('translates rename into a patch(nameOverride) call', () => {
    createComponent();

    api().onRename({ id: 'pr-1', value: 'New name' });

    expect(service.patch).toHaveBeenCalledWith('pr-1', { nameOverride: 'New name' });
  });

  it('translates setInstallmentNumber into a patch(installmentNumber) call', () => {
    createComponent();

    api().onSetInstallmentNumber({ id: 'pr-1', value: 6 });

    expect(service.patch).toHaveBeenCalledWith('pr-1', { installmentNumber: 6 });
  });

  it('does not call patch on toggleInstallment — no backend flag to set, only installmentNumber', () => {
    createComponent();

    api().onToggleInstallment();

    expect(service.patch).not.toHaveBeenCalled();
  });

  it('translates discard into a discard() call', () => {
    createComponent();

    api().onDiscard('pr-1');

    expect(service.discard).toHaveBeenCalledWith('pr-1');
  });

  it('translates confirmSelected into a confirm() call and maps failed items by id', () => {
    service.confirm.mockReturnValueOnce(
      of({
        confirmed: [{ pendingExpenseReviewId: 'ok-1', expenseId: 'exp-1' }],
        failed: [{ pendingExpenseReviewId: 'bad-1', errorMessage: 'Pending review not found' }],
      }),
    );
    createComponent();

    api().onConfirmSelected(['ok-1', 'bad-1']);

    expect(service.confirm).toHaveBeenCalledWith(['ok-1', 'bad-1']);
    expect(api().confirmErrorsById().get('bad-1')).toBe('Pending review not found');
    expect(api().confirmErrorsById().has('ok-1')).toBe(false);
  });

  it('builds an aggregate "X confirmed, Y failed" summary from a mixed batch, flagged as a failure note', () => {
    service.confirm.mockReturnValueOnce(
      of({
        confirmed: [{ pendingExpenseReviewId: 'ok-1', expenseId: 'exp-1' }],
        failed: [{ pendingExpenseReviewId: 'bad-1', errorMessage: 'Pending review not found' }],
      }),
    );
    createComponent();

    api().onConfirmSelected(['ok-1', 'bad-1']);

    expect(api().confirmSummary()).toBe('1 confirmado(s), 1 falhou.');
    expect(api().hasConfirmFailures()).toBe(true);
  });

  it('builds a non-failure summary when the whole batch confirms successfully', () => {
    service.confirm.mockReturnValueOnce(
      of({
        confirmed: [
          { pendingExpenseReviewId: 'ok-1', expenseId: 'exp-1' },
          { pendingExpenseReviewId: 'ok-2', expenseId: 'exp-2' },
        ],
        failed: [],
      }),
    );
    createComponent();

    api().onConfirmSelected(['ok-1', 'ok-2']);

    expect(api().confirmSummary()).toBe('2 confirmado(s), 0 falharam.');
    expect(api().hasConfirmFailures()).toBe(false);
  });

  it('clears the previous summary as soon as a new confirm batch starts', () => {
    service.confirm.mockReturnValueOnce(
      of({ confirmed: [], failed: [{ pendingExpenseReviewId: 'bad-1', errorMessage: 'boom' }] }),
    );
    createComponent();
    api().onConfirmSelected(['bad-1']);
    expect(api().confirmSummary()).not.toBeNull();

    service.confirm.mockReturnValueOnce(
      new Observable(() => {
        // Never emits — simulates an in-flight request so we can assert the summary was
        // cleared before the new result arrives, not just overwritten after.
      }),
    );
    api().onConfirmSelected(['bad-1']);

    expect(api().confirmSummary()).toBeNull();
  });

  it('does not call confirm() with an empty id list', () => {
    createComponent();

    api().onConfirmSelected([]);

    expect(service.confirm).not.toHaveBeenCalled();
  });

  it('renders the failure summary as an ew-alert and the all-success summary as a status note', () => {
    service.confirm.mockReturnValueOnce(
      of({
        confirmed: [],
        failed: [{ pendingExpenseReviewId: 'bad-1', errorMessage: 'Pending review not found' }],
      }),
    );
    createComponent();

    api().onConfirmSelected(['bad-1']);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('0 confirmado(s), 1 falhou.');
  });

  it('swallows patch errors without throwing (subscriber tears down safely)', () => {
    service.patch.mockReturnValueOnce(throwError(() => new Error('network error')));
    createComponent();

    expect(() => api().onRename({ id: 'pr-1', value: 'x' })).not.toThrow();
  });
});
