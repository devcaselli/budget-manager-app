import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreditCard } from '@features/credit-card/models/credit-card';

import { OmegaViewerExpenseDetail } from '../models/omega-viewer-detail';
import { ViewerEditFormComponent } from './viewer-edit-form.component';

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
    details: 'Some details',
    tagIds: [],
    payerName: null,
    payments: [],
    installmentsRemaining: null,
    links: [],
    audit: null,
    ...overrides,
  };
}

const creditCards: readonly CreditCard[] = [
  { id: 'card-1', name: 'Nubank' },
  { id: 'card-2', name: 'Itaú' },
];

describe('ViewerEditFormComponent', () => {
  let fixture: ComponentFixture<ViewerEditFormComponent>;
  let component: ViewerEditFormComponent;

  /** `async` + `whenStable()` — the constructor's seeding `effect()` does not necessarily
   * flush on the first `detectChanges()` call (same microtask-settling caveat documented in
   * `omega-viewer.component.spec.ts`'s F-13 block), so any test that inspects `dirtyChange`
   * emissions must let the initial seed fully settle before subscribing/asserting, otherwise
   * the seed's own `form.reset()` — which legitimately fires a `dirtyChange(false)` — can be
   * misattributed to a later, unrelated `setValue` call. */
  async function setup(detail: OmegaViewerExpenseDetail): Promise<void> {
    TestBed.configureTestingModule({ imports: [ViewerEditFormComponent] });
    fixture = TestBed.createComponent(ViewerEditFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('expense', detail);
    fixture.componentRef.setInput('creditCards', creditCards);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('seeds the form from the expense input', async () => {
    await setup(buildExpenseDetail());

    expect(component['form'].getRawValue()).toEqual({
      name: 'Groceries',
      cost: 100,
      purchaseDate: '2026-07-01',
      creditCardId: 'card-1',
      details: 'Some details',
    });
  });

  it('seeds an empty creditCardId when the expense has none (cash/debit)', async () => {
    await setup(buildExpenseDetail({ creditCardId: null }));

    expect(component['form'].getRawValue().creditCardId).toBe('');
  });

  // `FormControl.setValue()` alone never flips `dirty` — only real user interaction (a DOM
  // `(input)` event via the control's `ControlValueAccessor`) does, which is what a real
  // `<input formControlName>` fires as the user types. Driving the test through the actual
  // `<input>` element (same convention as `installment-create-dialog.component.spec.ts`)
  // exercises the exact path a real user goes through, rather than trying to hand-order
  // `setValue`/`markAsDirty` calls to approximate it.
  it('emits dirtyChange(true) once the user types into a field, after the initial seed has settled', async () => {
    await setup(buildExpenseDetail());
    const emissions: boolean[] = [];
    component.dirtyChange.subscribe((v) => emissions.push(v));

    const nameInput = (fixture.nativeElement as HTMLElement).querySelector(
      '#vef-name',
    ) as HTMLInputElement;
    nameInput.value = 'Groceries (edited)';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(emissions.at(-1)).toBe(true);
  });

  it('emits dirtyChange(false) again once the form is reset back to pristine', async () => {
    await setup(buildExpenseDetail());
    const emissions: boolean[] = [];
    component.dirtyChange.subscribe((v) => emissions.push(v));

    const nameInput = (fixture.nativeElement as HTMLElement).querySelector(
      '#vef-name',
    ) as HTMLInputElement;
    nameInput.value = 'Groceries (edited)';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(emissions.at(-1)).toBe(true);

    component['form'].controls.name.setValue('Groceries');
    component['form'].controls.name.markAsPristine();
    component['form'].updateValueAndValidity();
    fixture.detectChanges();
    expect(emissions.at(-1)).toBe(false);
  });

  it('blocks submit and marks all controls touched when the form is invalid (e.g. name cleared)', async () => {
    await setup(buildExpenseDetail());

    let emitted: unknown;
    component.save.subscribe((v) => (emitted = v));

    component['form'].controls.name.setValue('');
    component['submit']();

    expect(emitted).toBeUndefined();
    expect(component['form'].controls.name.touched).toBe(true);
  });

  it('blocks submit when cost is set to zero or below', async () => {
    await setup(buildExpenseDetail());

    let emitted: unknown;
    component.save.subscribe((v) => (emitted = v));

    component['form'].controls.cost.setValue(0);
    component['submit']();

    expect(emitted).toBeUndefined();
  });

  it('save emits only the fields that changed vs. the original expense', async () => {
    await setup(buildExpenseDetail());

    let emitted: unknown;
    component.save.subscribe((v) => (emitted = v));

    component['form'].controls.cost.setValue(150);
    component['submit']();

    expect(emitted).toEqual({ cost: 150 });
  });

  it('save emits an empty patch when nothing changed', async () => {
    await setup(buildExpenseDetail());

    let emitted: unknown;
    component.save.subscribe((v) => (emitted = v));

    component['submit']();

    expect(emitted).toEqual({});
  });

  it('save emits creditCardId when switched to cash/debit (empty string)', async () => {
    await setup(buildExpenseDetail({ creditCardId: 'card-1' }));

    let emitted: unknown;
    component.save.subscribe((v) => (emitted = v));

    component['form'].controls.creditCardId.setValue('');
    component['submit']();

    expect(emitted).toEqual({ creditCardId: '' });
  });

  it('trims name and details before diffing/emitting', async () => {
    await setup(buildExpenseDetail({ name: 'Groceries', details: 'note' }));

    let emitted: unknown;
    component.save.subscribe((v) => (emitted = v));

    component['form'].controls.name.setValue('  Groceries  ');
    component['form'].controls.details.setValue('  note  ');
    component['submit']();

    // Trimmed values equal the originals, so neither field should appear in the diff.
    expect(emitted).toEqual({});
  });

  it('cancel emits the cancel output', async () => {
    await setup(buildExpenseDetail());

    let cancelled = false;
    component.cancelEdit.subscribe(() => (cancelled = true));

    component['onCancel']();

    expect(cancelled).toBe(true);
  });

  it('re-seeding with a new expense input resets the form (e.g. after a successful save)', async () => {
    await setup(buildExpenseDetail());
    component['form'].controls.cost.setValue(999);
    expect(component['form'].getRawValue().cost).toBe(999);

    fixture.componentRef.setInput('expense', buildExpenseDetail({ cost: 150 }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['form'].getRawValue().cost).toBe(150);
  });

  // M1 — `min(0.01)` alone lets through a `cost` reduction that the backend will reject
  // (`ExpenseCostBelowPaidAmountException` when the new cost falls below the amount already
  // paid, i.e. `cost - remaining`). The dynamic `minCost` validator replicates that business
  // rule client-side, using only `cost`/`remaining` already present on the input detail —
  // never computing or displaying a new `remaining` value.
  describe('M1 — dynamic min-cost validator (cost >= amount already paid)', () => {
    it('minCost is 0.01 (the DTO floor) when nothing has been paid yet', async () => {
      // cost 100, remaining 100 -> paidAmount 0 -> floor applies
      await setup(buildExpenseDetail({ cost: 100, remaining: 100 }));

      expect(component['minCost']()).toBe(0.01);
    });

    it('minCost is the amount already paid when it exceeds the DTO floor', async () => {
      // cost 300, remaining 100 -> paidAmount 200
      await setup(buildExpenseDetail({ cost: 300, remaining: 100 }));

      expect(component['minCost']()).toBe(200);
    });

    it('rejects a cost below the amount already paid', async () => {
      await setup(buildExpenseDetail({ cost: 300, remaining: 100 })); // paidAmount = 200

      component['form'].controls.cost.setValue(150);
      component['form'].controls.cost.updateValueAndValidity();

      expect(component['form'].controls.cost.valid).toBe(false);
      expect(component['form'].controls.cost.errors?.['min']).toBeDefined();
    });

    it('accepts a cost at or above the amount already paid', async () => {
      await setup(buildExpenseDetail({ cost: 300, remaining: 100 })); // paidAmount = 200

      component['form'].controls.cost.setValue(200);
      component['form'].controls.cost.updateValueAndValidity();

      expect(component['form'].controls.cost.valid).toBe(true);
    });

    it('re-derives minCost when a new expense (with different paidAmount) is seeded', async () => {
      await setup(buildExpenseDetail({ cost: 300, remaining: 100 })); // paidAmount = 200
      expect(component['minCost']()).toBe(200);

      fixture.componentRef.setInput(
        'expense',
        buildExpenseDetail({ cost: 500, remaining: 450 }), // paidAmount = 50
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['minCost']()).toBe(50);
    });

    it('minCostMessage names the real minimum, formatted as BRL, once something is already paid', async () => {
      await setup(buildExpenseDetail({ cost: 300, remaining: 100 })); // paidAmount = 200

      expect(component['minCostMessage']()).toContain('200');
    });

    it('minCostMessage falls back to the generic message when nothing has been paid', async () => {
      await setup(buildExpenseDetail({ cost: 100, remaining: 100 })); // paidAmount = 0

      expect(component['minCostMessage']()).toBe('Enter a cost greater than zero.');
    });
  });

  // C2 — the shell-owned save-failure message is rendered here, inside the still-open form,
  // with `role="alert"` so it's actually visible to the user (not hidden behind the modal
  // like `ExpenseService.error$`/`ExpensePage`'s own alert would be).
  describe('C2 — saveError input rendering', () => {
    it('renders nothing when saveError is null', async () => {
      await setup(buildExpenseDetail());

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.ew-alert[role="alert"]')).toBeNull();
    });

    it('renders the saveError message with role="alert" when set', async () => {
      await setup(buildExpenseDetail());
      fixture.componentRef.setInput('saveError', 'Não foi possível salvar as alterações. Tente novamente.');
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const alert = root.querySelector('.ew-alert[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('Não foi possível salvar as alterações. Tente novamente.');
    });
  });
});
