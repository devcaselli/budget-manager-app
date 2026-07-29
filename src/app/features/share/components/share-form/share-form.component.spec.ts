import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { ExpenseService } from '@features/expense/services/expense.service';
import { InstallmentService } from '@features/installment/services/installment.service';
import { ShareService } from '@features/share/services/share.service';
import { SubscriptionService } from '@features/subscription/services/subscription.service';
import { WalletService } from '@features/wallet/services/wallet.service';
import { Expense } from '@features/expense/models/expense';
import { Share, CreateShareRequest } from '@features/share/models/share';
import { Wallet } from '@features/wallet/models/wallet';
import { Payer } from '@features/payer/models/payer';

import { ShareFormComponent } from './share-form.component';

// ── Fakes ──────────────────────────────────────────────────────────────────
// This form was extracted from SharePage in Task 4 (4a: mechanical extraction, no
// behavior change for FIXED mode; 4c: new PERCENT mode). FIXED-mode coverage here is a
// straight port of what used to live in share-page.spec.ts before the extraction —
// regression protection, not new behavior.

class FakeShareService {
  readonly shares$ = new BehaviorSubject<readonly Share[]>([]);
  readonly saving$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadAll = vi.fn();
  create = vi.fn((request: CreateShareRequest) =>
    of({
      id: 'share-new',
      walletId: request.walletId,
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      sourceName: 'Some source',
      totalAmount: request.totalAmount,
      ownerShare: request.ownerShare,
      ownerRatio: request.ownerShare / request.totalAmount,
      currency: request.currency,
      status: 'ACTIVE',
      quotas: [],
      paymentIds: [],
      createdAt: '2026-06-01T10:00:00Z',
      revertedAt: null,
      stoppedFromMonth: null,
    } satisfies Share),
  );
}

class FakeExpenseService {
  readonly expenses$ = new BehaviorSubject<readonly Expense[]>([]);
  loadByWalletId = vi.fn();
}

class FakeInstallmentService {
  readonly allInstallments$ = new BehaviorSubject<readonly unknown[]>([]);
  loadByWalletId = vi.fn();
}

function buildInstallment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'installment-1',
    description: 'Laptop',
    currency: 'BRL',
    installmentNumber: 3,
    effectiveOriginalValue: 3000,
    effectiveInstallmentValue: 1000,
    ...overrides,
  };
}

function buildSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub-1',
    description: 'Netflix',
    currency: 'BRL',
    state: 'PRODUCTION',
    flag: 'NONE',
    startMonth: '2026-01',
    endMonth: null,
    versions: [{ effectiveMonth: '2026-01', amount: 55 }],
    creditCardId: null,
    ...overrides,
  };
}

class FakeSubscriptionService {
  readonly subscriptions$ = new BehaviorSubject<readonly unknown[]>([]);
  loadSubscriptions = vi.fn();
}

class FakeWalletService {
  readonly selectedWallet$ = new BehaviorSubject<Wallet | null>({ id: 'wallet-1' } as Wallet);
  findPayersByWalletId(): Observable<Payer[]> {
    return of([
      buildPayer({ id: 'payer-1', name: 'Maria', type: 'STANDING' }),
      buildPayer({ id: 'payer-2', name: 'Carlos', type: 'STANDING' }),
      buildPayer({ id: 'payer-3', name: 'Ana', type: 'STANDING' }),
    ]);
  }
}

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    name: 'Groceries',
    cost: 100,
    purchaseDate: '2026-06-01',
    remaining: 100,
    walletId: 'wallet-1',
    bulletId: null,
    creditCardId: 'card-1',
    installment: false,
    installmentNumber: null,
    installmentId: null,
    ...overrides,
  };
}

function buildShare(overrides: Partial<Share> = {}): Share {
  return {
    id: 'share-1',
    walletId: 'wallet-1',
    sourceType: 'EXPENSE',
    sourceId: 'expense-1',
    sourceName: 'Some expense',
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
    ...overrides,
  };
}

function buildPayer(overrides: Partial<Payer> = {}): Payer {
  return {
    id: 'payer-1',
    name: 'Maria',
    type: 'STANDING',
    walletId: 'wallet-1',
    subscriptionId: null,
    paymentDate: '2026-06-10',
    amountDue: 0,
    activeShareAmount: 0,
    currency: 'BRL',
    deleted: false,
    ...overrides,
  };
}

describe('ShareFormComponent', () => {
  let fixture: ComponentFixture<ShareFormComponent>;
  let component: ShareFormComponent;
  let shareService: FakeShareService;
  let expenseService: FakeExpenseService;

  beforeEach(() => {
    shareService = new FakeShareService();
    expenseService = new FakeExpenseService();

    TestBed.configureTestingModule({
      imports: [ShareFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShareService, useValue: shareService },
        { provide: ExpenseService, useValue: expenseService },
        { provide: InstallmentService, useClass: FakeInstallmentService },
        { provide: SubscriptionService, useClass: FakeSubscriptionService },
        { provide: WalletService, useClass: FakeWalletService },
      ],
    });

    fixture = TestBed.createComponent(ShareFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function sourceOptions() {
    return (component as unknown as { sourceOptions: () => readonly { id: string }[] }).sourceOptions();
  }

  function setSplitMode(mode: 'FIXED' | 'PERCENT'): void {
    (component as unknown as { setSplitMode: (m: 'FIXED' | 'PERCENT') => void }).setSplitMode(mode);
    fixture.detectChanges();
  }

  function quotaAt(index: number) {
    const quotas = (component as unknown as { form: { controls: { quotas: { at: (i: number) => unknown } } } }).form.controls.quotas;
    return quotas.at(index) as { controls: Record<string, { setValue: (v: unknown) => void }> };
  }

  function ownerShareControl() {
    return (component as unknown as { form: { controls: { ownerShare: { setValue: (v: number) => void } } } }).form.controls.ownerShare;
  }

  function canSubmit(): boolean {
    return (component as unknown as { canSubmit: () => boolean }).canSubmit();
  }

  function submitBlockers(): readonly string[] {
    return (component as unknown as { submitBlockers: () => readonly string[] }).submitBlockers();
  }

  describe('sourceOptions (EXPENSE dropdown exclusion)', () => {
    it('lists an expense that has no active share', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
      shareService.shares$.next([]);
      fixture.detectChanges();

      expect(sourceOptions().map((o) => o.id)).toContain('expense-1');
    });

    it('excludes an expense that already has an ACTIVE share', () => {
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1' }),
        buildExpense({ id: 'expense-2', name: 'Fuel' }),
      ]);
      shareService.shares$.next([buildShare({ sourceId: 'expense-1', status: 'ACTIVE' })]);
      fixture.detectChanges();

      const ids = sourceOptions().map((o) => o.id);
      expect(ids).not.toContain('expense-1');
      expect(ids).toContain('expense-2');
    });

    it('re-lists an expense once its share is REVERTED', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1' })]);
      shareService.shares$.next([buildShare({ sourceId: 'expense-1', status: 'REVERTED' })]);
      fixture.detectChanges();

      expect(sourceOptions().map((o) => o.id)).toContain('expense-1');
    });
  });

  describe('FIXED mode (regression — behavior must match the pre-extraction form)', () => {
    beforeEach(() => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();
    });

    it('enables submit when owner share + quota amounts balance to the total (delta zero)', () => {
      ownerShareControl().setValue(70);
      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['amount']!.setValue(30);
      fixture.detectChanges();

      expect(canSubmit()).toBe(true);
    });

    it('blocks submit when the delta is non-zero', () => {
      ownerShareControl().setValue(50);
      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['amount']!.setValue(30);
      fixture.detectChanges();

      expect(canSubmit()).toBe(false);
      expect(submitBlockers().some((b) => b.includes('must balance'))).toBe(true);
    });
  });

  describe('PERCENT mode', () => {
    beforeEach(() => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();
      setSplitMode('PERCENT');
    });

    it('derives owner % as 100 minus the quotas sum, never typed', () => {
      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['percent']!.setValue(30);
      fixture.detectChanges();

      const ownerPercent = (component as unknown as { ownerPercent: () => number }).ownerPercent();
      expect(ownerPercent).toBe(70);
    });

    it('keeps ownerPercent at full precision even though the display copy is rounded to 1 decimal', () => {
      // Regression: an earlier version of this component fed the 1-decimal DISPLAY
      // rounding (matching the design's `sh-owner-pct` formatting) into the money math
      // itself, silently dropping precision — 33.333/33.333 quotas would derive an owner
      // of "33.3%" instead of the correct 33.334%, converting to the wrong R$ amount on
      // submit. `ownerPercent()` (used by createShare()) must stay unrounded;
      // `ownerPercentDisplay()` is the only place that rounds, and only for the UI.
      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['percent']!.setValue(33.333);
      component['addQuota']();
      quotaAt(1).controls['payerId']!.setValue('payer-2');
      quotaAt(1).controls['percent']!.setValue(33.333);
      fixture.detectChanges();

      const ownerPercent = (component as unknown as { ownerPercent: () => number }).ownerPercent();
      const ownerPercentDisplay = (component as unknown as { ownerPercentDisplay: () => number }).ownerPercentDisplay();

      expect(ownerPercent).toBeCloseTo(33.334, 5);
      expect(ownerPercentDisplay).toBe(33.3);
    });

    it('blocks submit with a specific message when quotas exceed 100%', () => {
      component['addQuota']();
      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['percent']!.setValue(60);
      quotaAt(1).controls['payerId']!.setValue('payer-2');
      quotaAt(1).controls['percent']!.setValue(50);
      fixture.detectChanges();

      expect(canSubmit()).toBe(false);
      expect(submitBlockers().some((b) => b.includes('exceed 100%'))).toBe(true);
    });

    it('converts percent quotas to R$ on submit without forcing the last cent to close exactly', () => {
      // 33.333% of R$ 1000, twice: round2(1000 * 33.333 / 100) = round2(333.33) = 333.33
      // for each quota. Owner gets the remaining 100 - 33.333 - 33.333 = 33.334% =
      // round2(333.34) = 333.34. Sum of the three R$ amounts is exactly 1000.00 here, but
      // the point of the test is that NO manual adjustment step runs — round2(total *
      // percent / 100) is applied uniformly to every quota AND to the owner, with no
      // special-casing of "the last one". The backend's balanceTolerance (Share.java,
      // backend-tasks.md Task 3) is what absorbs any drift a different percent split (e.g.
      // one that doesn't round this cleanly) would introduce — not client-side adjustment.
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 1000 })]);
      fixture.detectChanges();

      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['percent']!.setValue(33.333);
      component['addQuota']();
      quotaAt(1).controls['payerId']!.setValue('payer-2');
      quotaAt(1).controls['percent']!.setValue(33.333);
      fixture.detectChanges();

      (component as unknown as { createShare: () => void }).createShare();

      expect(shareService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerShare: 333.34,
          quotas: [
            expect.objectContaining({ amount: 333.33 }),
            expect.objectContaining({ amount: 333.33 }),
          ],
        }),
      );
    });
  });

  describe('switching FIXED <-> PERCENT does not corrupt form state', () => {
    it('preserves the selected source and payer across a mode switch', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();
      quotaAt(0).controls['payerId']!.setValue('payer-1');

      setSplitMode('PERCENT');
      setSplitMode('FIXED');

      const sourceIdValue = (component as unknown as { form: { controls: { sourceId: { value: string } } } }).form.controls.sourceId.value;
      expect(sourceIdValue).toBe('expense-1');
      expect(quotaAt(0).controls['payerId']).toBeTruthy();
    });
  });

  describe('created output', () => {
    it('emits the created share on successful submit', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();
      ownerShareControl().setValue(70);
      quotaAt(0).controls['payerId']!.setValue('payer-1');
      quotaAt(0).controls['amount']!.setValue(30);
      fixture.detectChanges();

      let emitted: Share | undefined;
      component.created.subscribe((share) => (emitted = share));

      (component as unknown as { createShare: () => void }).createShare();

      expect(emitted?.id).toBe('share-new');
    });
  });

  describe('dropdown selection (Source / Payer)', () => {
    it('source select: choosing an option via the DOM keeps sourceId in sync', () => {
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1', name: 'Groceries', cost: 100 }),
        buildExpense({ id: 'expense-2', name: 'Fuel', cost: 200 }),
      ]);
      fixture.detectChanges();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      select.value = 'expense-2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const sourceIdValue = (component as unknown as { form: { controls: { sourceId: { value: string } } } }).form.controls.sourceId.value;
      expect(sourceIdValue).toBe('expense-2');
    });

    it('payer select: choosing an option via the DOM keeps payerId in sync', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-payer-0');
      select.value = 'payer-2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const payerId = quotaAt(0).controls['payerId'] as unknown as { value: string };
      expect(payerId.value).toBe('payer-2');
    });

    it('sourceOptions recompute (new array identity, same content) does not silently reassign sourceId', () => {
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1', name: 'Groceries', cost: 100 }),
        buildExpense({ id: 'expense-2', name: 'Fuel', cost: 200 }),
      ]);
      fixture.detectChanges();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      select.value = 'expense-2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // Re-emit an equivalent-but-new array reference, simulating an unrelated reload
      // (e.g. shareService.loadAll() firing again) while the user already picked expense-2.
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1', name: 'Groceries', cost: 100 }),
        buildExpense({ id: 'expense-2', name: 'Fuel', cost: 200 }),
      ]);
      fixture.detectChanges();

      const sourceIdValue = (component as unknown as { form: { controls: { sourceId: { value: string } } } }).form.controls.sourceId.value;
      expect(sourceIdValue).toBe('expense-2');
    });

    it('switching sourceType from EXPENSE to INSTALLMENT resolves sourceId to a real installment id', () => {
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1', name: 'Groceries', cost: 100 }),
        buildExpense({ id: 'expense-2', name: 'Fuel', cost: 200 }),
      ]);
      fixture.detectChanges();

      const sourceSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      sourceSelect.value = 'expense-2';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const typeSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-type');
      typeSelect.value = 'INSTALLMENT';
      typeSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const installmentService = TestBed.inject(InstallmentService) as unknown as FakeInstallmentService;
      installmentService.allInstallments$.next([
        buildInstallment({ id: 'installment-1' }),
        buildInstallment({ id: 'installment-2', description: 'Phone' }),
      ]);
      fixture.detectChanges();

      const sourceIdValue = (component as unknown as { form: { controls: { sourceId: { value: string } } } }).form.controls.sourceId.value;
      expect(['installment-1', 'installment-2']).toContain(sourceIdValue);
      expect(sourceIdValue).not.toBe('expense-2');
    });

    it('removing quota 0 does not corrupt quota 1 payer selection', () => {
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();

      quotaAt(0).controls['payerId']!.setValue('payer-1');
      component['addQuota']();
      fixture.detectChanges();
      quotaAt(1).controls['payerId']!.setValue('payer-2');
      fixture.detectChanges();

      component['removeQuota'](0);
      fixture.detectChanges();

      const remaining = quotaAt(0).controls['payerId'] as unknown as { value: string };
      expect(remaining.value).toBe('payer-2');
    });

    it('regression: removing a MIDDLE quota does not leave a stale payer selected in the reused DOM <select>', () => {
      // Root cause (bug fixed in this commit): `@for (quota of quotaControls(); track
      // $index; ...)` tracked quota rows by array position. `[formGroupName]="index"` is
      // also position-based, so when a middle FormGroup was removed, Angular treated the
      // <select> DOM node at that position as unchanged and reused it — including its
      // browser-owned visible selection — for the FormGroup that shifted into that slot.
      // The FormControl (submitted value) correctly held the shifted payer, but the DOM
      // <select> kept showing the payer that used to occupy that position: the user would
      // see one payer highlighted while a different one was actually submitted. Fixed by
      // tracking the FormGroup instance itself (`track quota`) instead of `$index`.
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();

      quotaAt(0).controls['payerId']!.setValue('payer-1');
      component['addQuota']();
      fixture.detectChanges();
      quotaAt(1).controls['payerId']!.setValue('payer-2');
      component['addQuota']();
      fixture.detectChanges();
      quotaAt(2).controls['payerId']!.setValue('payer-3');
      fixture.detectChanges();

      // Remove the middle quota (index 1, payer-2). Quota 2 (payer-3) shifts to index 1.
      component['removeQuota'](1);
      fixture.detectChanges();

      const selects: NodeListOf<HTMLSelectElement> = fixture.nativeElement.querySelectorAll(
        '[id^="sp-payer-"]',
      );
      const domValues = Array.from(selects).map((s) => s.value);

      const control0 = quotaAt(0).controls['payerId'] as unknown as { value: string };
      const control1 = quotaAt(1).controls['payerId'] as unknown as { value: string };

      expect(control0.value).toBe('payer-1');
      expect(control1.value).toBe('payer-3');
      // The DOM must agree with the FormControl — this is what actually gets submitted.
      expect(domValues[0]).toBe('payer-1');
      expect(domValues[1]).toBe('payer-3');
    });

    it('SUBSCRIPTION source: switching from one subscription to another updates sourceId, totalAmount and the auto-filled quota amount to the newly selected subscription (not the previous one)', () => {
      const subscriptionService = TestBed.inject(SubscriptionService) as unknown as FakeSubscriptionService;
      subscriptionService.subscriptions$.next([
        buildSubscription({ id: 'sub-netflix', description: 'Netflix', versions: [{ effectiveMonth: '2026-01', amount: 55 }] }),
        buildSubscription({ id: 'sub-microsoft', description: 'Microsoft', versions: [{ effectiveMonth: '2026-01', amount: 40 }] }),
      ]);
      const typeSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-type');
      typeSelect.value = 'SUBSCRIPTION';
      typeSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const sourceSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      sourceSelect.value = 'sub-netflix';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // Sanity check on the first pick, matching the pre-existing single-quota auto-fill
      // convenience: totalAmount and the sole quota's amount both track Netflix's 55.
      const totalAmountControl = (component as unknown as { form: { controls: { totalAmount: { value: number } } } }).form.controls.totalAmount;
      expect(totalAmountControl.value).toBe(55);
      expect((quotaAt(0).controls['amount'] as unknown as { value: number }).value).toBe(55);

      // Root cause repro: switching the SOURCE dropdown to Microsoft (a different item,
      // different amount) must not leave Netflix's amount bound in the untouched quota —
      // that is the "select Microsoft, Netflix's value is used" bug.
      sourceSelect.value = 'sub-microsoft';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const sourceIdValue = (component as unknown as { form: { controls: { sourceId: { value: string } } } }).form.controls.sourceId.value;
      expect(sourceIdValue).toBe('sub-microsoft');
      expect(totalAmountControl.value).toBe(40);
      expect((quotaAt(0).controls['amount'] as unknown as { value: number }).value).toBe(40);
    });

    it('SUBSCRIPTION source: a user-edited quota amount of exactly 0 (DOM input, marks the control dirty) is preserved across a later source switch', () => {
      // Deliberately types 0, not some other number: the OLD guard (`amount === 0`) could
      // not tell a user-typed 0 apart from an untouched field and would happily overwrite
      // it on the next source switch — silently discarding what the user just typed. Only
      // the `dirty` flag distinguishes "field still says 0 because nobody touched it" from
      // "field says 0 because the user typed it". This is the value that actually exercises
      // the fix; any nonzero value would already have passed under the old guard too.
      const subscriptionService = TestBed.inject(SubscriptionService) as unknown as FakeSubscriptionService;
      subscriptionService.subscriptions$.next([
        buildSubscription({ id: 'sub-netflix', description: 'Netflix', versions: [{ effectiveMonth: '2026-01', amount: 55 }] }),
        buildSubscription({ id: 'sub-microsoft', description: 'Microsoft', versions: [{ effectiveMonth: '2026-01', amount: 40 }] }),
      ]);
      const typeSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-type');
      typeSelect.value = 'SUBSCRIPTION';
      typeSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const sourceSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      sourceSelect.value = 'sub-netflix';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const amountInput: HTMLInputElement = fixture.nativeElement.querySelector('#sp-amount-0');
      amountInput.value = '0';
      amountInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const amountControl = quotaAt(0).controls['amount'] as unknown as { value: number; dirty: boolean };
      expect(amountControl.dirty).toBe(true);

      sourceSelect.value = 'sub-microsoft';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // The user deliberately typed 0 — the auto-fill convenience must back off once the
      // field is dirty, regardless of which source is subsequently selected.
      expect(amountControl.value).toBe(0);
    });

    it('collapsing back to a single quota via removeQuota() clears the surviving quota\'s dirty flag, so source-switch auto-fill resumes', () => {
      // Same bug class as above, reached a different way: dirty a quota that is NOT the
      // one removed. FormArray.removeAt() on the other quota leaves the surviving
      // control's `dirty` flag untouched, which — without the fix — would permanently wedge
      // auto-fill for the rest of the form's lifetime even though there is only one quota
      // again (the single-quota-remaining branch of removeQuota() only resets when the
      // REMOVED quota was already the last one, i.e. index 0 with length 1).
      expenseService.expenses$.next([buildExpense({ id: 'expense-1', cost: 100 })]);
      fixture.detectChanges();

      const amountInput: HTMLInputElement = fixture.nativeElement.querySelector('#sp-amount-0');
      amountInput.value = '0';
      amountInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const amountControl = quotaAt(0).controls['amount'] as unknown as { value: number; dirty: boolean };
      expect(amountControl.dirty).toBe(true);

      component['addQuota']();
      fixture.detectChanges();

      // Remove the SECOND quota (index 1), not the dirtied quota 0 — collapses back to a
      // single quota via the `quotas.removeAt(index)` path, not the reset() path.
      component['removeQuota'](1);
      fixture.detectChanges();

      expect(amountControl.dirty).toBe(false);

      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1', cost: 100 }),
        buildExpense({ id: 'expense-2', name: 'Fuel', cost: 200 }),
      ]);
      fixture.detectChanges();

      const sourceSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      sourceSelect.value = 'expense-2';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // Auto-fill must resume now that the surviving quota is pristine again.
      expect(amountControl.value).toBe(200);
    });

    it('PERCENT mode: the (hidden, not rendered in this mode) quota amount control still tracks source switches via the same auto-fill effect', () => {
      // The `amount` field isn't rendered while splitMode is PERCENT (the template swaps
      // it for `percent`), but the FormControl still exists and the constructor effect
      // that auto-fills it from the selected source keeps running regardless of
      // splitMode. Covering this so a future change scoped to "only run in FIXED mode"
      // doesn't silently break FIXED mode's own auto-fill by accident.
      expenseService.expenses$.next([
        buildExpense({ id: 'expense-1', cost: 100 }),
        buildExpense({ id: 'expense-2', name: 'Fuel', cost: 200 }),
      ]);
      fixture.detectChanges();
      setSplitMode('PERCENT');

      const sourceSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#sp-source-id');
      sourceSelect.value = 'expense-1';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      let amountControl = quotaAt(0).controls['amount'] as unknown as { value: number };
      expect(amountControl.value).toBe(100);

      sourceSelect.value = 'expense-2';
      sourceSelect.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      amountControl = quotaAt(0).controls['amount'] as unknown as { value: number };
      expect(amountControl.value).toBe(200);
    });
  });
});
