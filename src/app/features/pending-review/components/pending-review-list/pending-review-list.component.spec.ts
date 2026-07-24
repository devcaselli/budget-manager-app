import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingReview } from '../../models/pending-review';
import { PendingReviewListComponent } from './pending-review-list.component';

interface Internals {
  isSelected: (id: string) => boolean;
  isInstallment: (item: PendingReview) => boolean;
  errorFor: (item: PendingReview) => string | undefined;
  onToggleSelected: (id: string) => void;
  onToggleInstallment: (item: PendingReview) => void;
  onInstallmentNumberChange: (item: PendingReview, rawValue: string) => void;
  onDiscard: (item: PendingReview) => void;
  onConfirmSelected: () => void;
  nameControlFor: (item: PendingReview) => { value: string };
  nameControls: Map<string, unknown>;
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

describe('PendingReviewListComponent', () => {
  let fixture: ComponentFixture<PendingReviewListComponent>;
  let component: PendingReviewListComponent;

  function api(): Internals {
    return component as unknown as Internals;
  }

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      imports: [PendingReviewListComponent],
    });

    fixture = TestBed.createComponent(PendingReviewListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setItems(items: readonly PendingReview[]): void {
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  }

  it('renders the resolved name (not the raw merchant) as the initial input value', () => {
    setItems([buildItem({ resolvedName: 'Padaria do Zé', merchant: 'PADARIA ZE LTDA SAO PAULO' })]);

    const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('Padaria do Zé');
  });

  it('shows the empty state when there are no items', () => {
    setItems([]);

    expect(fixture.nativeElement.textContent).toContain('Nenhuma importação pendente.');
  });

  it('defaults every item to selected', () => {
    setItems([buildItem({ id: 'a' }), buildItem({ id: 'b' })]);

    expect(api().isSelected('a')).toBe(true);
    expect(api().isSelected('b')).toBe(true);
  });

  it('toggles selection and emits toggleSelected', () => {
    setItems([buildItem({ id: 'a' })]);
    const emitted: string[] = [];
    component.toggleSelected.subscribe((id) => emitted.push(id));

    api().onToggleSelected('a');

    expect(api().isSelected('a')).toBe(false);
    expect(emitted).toEqual(['a']);
  });

  it('emits rename only after the debounce settles, with the final value', async () => {
    const item = buildItem({ id: 'a', resolvedName: 'Old name' });
    setItems([item]);
    const emitted: { id: string; value: string }[] = [];
    component.rename.subscribe((event) => emitted.push(event));

    const control = (component as unknown as {
      nameControlFor: (item: PendingReview) => { setValue: (v: string) => void };
    }).nameControlFor(item);

    control.setValue('New n');
    control.setValue('New name');

    await vi.advanceTimersByTimeAsync(399);
    expect(emitted).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(emitted).toEqual([{ id: 'a', value: 'New name' }]);
  });

  it('toggles the installment flag and reveals the installment-number field only when enabled', () => {
    const item = buildItem({ id: 'a', installmentNumber: null });
    setItems([item]);
    const emitted: { id: string; enabled: boolean }[] = [];
    component.toggleInstallment.subscribe((event) => emitted.push(event));

    expect(api().isInstallment(item)).toBe(false);
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();

    api().onToggleInstallment(item);
    fixture.detectChanges();

    expect(api().isInstallment(item)).toBe(true);
    expect(emitted).toEqual([{ id: 'a', enabled: true }]);
    expect(fixture.nativeElement.querySelector('input[type="number"]')).not.toBeNull();
  });

  it('treats an item with a pre-existing installmentNumber as already installment', () => {
    const item = buildItem({ id: 'a', installmentNumber: 6 });
    setItems([item]);

    expect(api().isInstallment(item)).toBe(true);
  });

  it('emits setInstallmentNumber only for values within the 2..120 range', () => {
    const item = buildItem({ id: 'a', installmentNumber: 3 });
    setItems([item]);
    const emitted: { id: string; value: number }[] = [];
    component.setInstallmentNumber.subscribe((event) => emitted.push(event));

    api().onInstallmentNumberChange(item, '1');
    api().onInstallmentNumberChange(item, '121');
    api().onInstallmentNumberChange(item, 'not-a-number');
    expect(emitted).toHaveLength(0);

    api().onInstallmentNumberChange(item, '12');
    expect(emitted).toEqual([{ id: 'a', value: 12 }]);
  });

  it('emits discard with the item id', () => {
    const item = buildItem({ id: 'a' });
    setItems([item]);
    const emitted: string[] = [];
    component.discard.subscribe((id) => emitted.push(id));

    api().onDiscard(item);

    expect(emitted).toEqual(['a']);
  });

  it('emits confirmSelected with only the ids still selected', () => {
    setItems([buildItem({ id: 'a' }), buildItem({ id: 'b' }), buildItem({ id: 'c' })]);
    api().onToggleSelected('b');
    const emitted: (readonly string[])[] = [];
    component.confirmSelected.subscribe((ids) => emitted.push(ids));

    api().onConfirmSelected();

    expect(emitted).toEqual([['a', 'c']]);
  });

  it('renders a per-item error from errorsById', () => {
    const item = buildItem({ id: 'a' });
    setItems([item]);
    fixture.componentRef.setInput('errorsById', new Map([['a', 'Pending review not found']]));
    fixture.detectChanges();

    expect(api().errorFor(item)).toBe('Pending review not found');
    expect(fixture.nativeElement.textContent).toContain('Pending review not found');
  });

  it('mixed batch: a failed item stays visible, checked, and re-confirmable, without leaking its error onto other items', () => {
    setItems([buildItem({ id: 'ok-1' }), buildItem({ id: 'bad-1' })]);
    // Service already removed 'ok-1' from the model after a successful confirm — only the
    // still-pending 'bad-1' remains in `items`, matching PendingReviewService.confirm().
    setItems([buildItem({ id: 'bad-1' })]);
    fixture.componentRef.setInput('errorsById', new Map([['bad-1', 'Pending review not found']]));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Pending review not found');
    expect(api().isSelected('bad-1')).toBe(true);
    expect(api().errorFor(buildItem({ id: 'ok-1' }))).toBeUndefined();

    const emitted: (readonly string[])[] = [];
    component.confirmSelected.subscribe((ids) => emitted.push(ids));
    api().onConfirmSelected();

    expect(emitted).toEqual([['bad-1']]);
  });

  it('prunes local state (form controls, selection) for ids no longer in items()', () => {
    setItems([buildItem({ id: 'a' }), buildItem({ id: 'b' })]);
    api().nameControlFor(buildItem({ id: 'a' }));
    api().nameControlFor(buildItem({ id: 'b' }));
    api().onToggleSelected('a');
    expect(api().nameControls.has('a')).toBe(true);
    expect(api().nameControls.has('b')).toBe(true);

    // 'a' confirmed/discarded and removed from items(); 'c' arrives fresh.
    setItems([buildItem({ id: 'b' }), buildItem({ id: 'c' })]);

    expect(api().nameControls.has('a')).toBe(false);
    expect(api().nameControls.has('b')).toBe(true);
    // A fresh id with no prior interaction still reads as selected (opt-out default intact).
    expect(api().isSelected('c')).toBe(true);
  });
});
