import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerSubscriptionDetail,
} from '../models/omega-viewer-detail';
import { ViewerNotesSectionComponent } from './viewer-notes-section.component';

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

function buildSubscriptionDetail(
  overrides: Partial<OmegaViewerSubscriptionDetail> = {},
): OmegaViewerSubscriptionDetail {
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
    details: 'Existing installment note',
    tagIds: [],
    payerName: null,
    progress: { paidInstallments: 7, remainingInstallments: 5, totalInstallments: 12 },
    payments: [],
    links: [],
    audit: null,
    ...overrides,
  };
}

describe('ViewerNotesSectionComponent', () => {
  let fixture: ComponentFixture<ViewerNotesSectionComponent>;
  let component: ViewerNotesSectionComponent;

  function setup(detail: OmegaViewerDetail): void {
    TestBed.configureTestingModule({ imports: [ViewerNotesSectionComponent] });
    fixture = TestBed.createComponent(ViewerNotesSectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('detail', detail);
    fixture.detectChanges();
  }

  describe('read-only rendering (Installment)', () => {
    it('shows the existing details text and no Edit button', () => {
      setup(buildInstallmentDetail({ details: 'Existing installment note' }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.textContent).toContain('Existing installment note');
      expect(root.querySelector('.vns__edit-btn')).toBeNull();
      expect(root.querySelector('form')).toBeNull();
      expect(root.querySelector('textarea')).toBeNull();
    });

    it('shows an empty state when details is null, without rendering any edit control', () => {
      setup(buildInstallmentDetail({ details: null }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vns__empty')?.textContent).toContain('Sem notas.');
      expect(root.querySelector('.vns__edit-btn')).toBeNull();
      expect(root.querySelector('textarea')).toBeNull();
    });

    it('startEdit() is a no-op for Installment (isEditable() is false)', () => {
      setup(buildInstallmentDetail());

      component['startEdit']();

      expect(component['editing']()).toBe(false);
    });
  });

  describe('editable rendering (Expense)', () => {
    it('shows the details text and an Edit button in the default (non-editing) state', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.textContent).toContain('Some details');
      expect(root.querySelector('.vns__edit-btn')).not.toBeNull();
      expect(root.querySelector('textarea')).toBeNull();
    });

    it('shows an empty state placeholder when details is null', () => {
      setup(buildExpenseDetail({ details: null }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vns__empty')?.textContent).toContain('Sem notas.');
    });

    it('clicking Edit renders a textarea seeded with the current details', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('.vns__edit-btn')
        ?.click();
      fixture.detectChanges();

      const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea');
      expect(textarea).not.toBeNull();
      expect(textarea?.value).toBe('Some details');
    });

    it('seeds an empty textarea when details is null and Edit is clicked', () => {
      setup(buildExpenseDetail({ details: null }));

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('.vns__edit-btn')
        ?.click();
      fixture.detectChanges();

      const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea');
      expect(textarea?.value).toBe('');
    });

    it('emits dirtyChange(true) once the user types into the textarea', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));
      const emissions: boolean[] = [];
      component.dirtyChange.subscribe((v) => emissions.push(v));

      component['startEdit']();
      fixture.detectChanges();

      const textarea = (fixture.nativeElement as HTMLElement).querySelector(
        'textarea',
      ) as HTMLTextAreaElement;
      textarea.value = 'Updated details';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(emissions.at(-1)).toBe(true);
    });

    it('save emits the trimmed textarea value', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));
      let emitted: string | undefined;
      component.save.subscribe((v) => (emitted = v));

      component['startEdit']();
      fixture.detectChanges();
      const textarea = (fixture.nativeElement as HTMLElement).querySelector(
        'textarea',
      ) as HTMLTextAreaElement;
      textarea.value = '  Updated details  ';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (fixture.nativeElement as HTMLElement)
        .querySelector('form')
        ?.dispatchEvent(new Event('submit'));

      expect(emitted).toBe('Updated details');
    });

    it('cancel closes local edit state and emits cancelEdit', () => {
      setup(buildExpenseDetail());
      let cancelled = false;
      component.cancelEdit.subscribe(() => (cancelled = true));

      component['startEdit']();
      fixture.detectChanges();
      expect(component['editing']()).toBe(true);

      component['onCancel']();

      expect(cancelled).toBe(true);
      expect(component['editing']()).toBe(false);
    });

    it('a fresh detail() input (e.g. after a successful save) closes local edit state', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));
      component['startEdit']();
      fixture.detectChanges();
      expect(component['editing']()).toBe(true);

      fixture.componentRef.setInput('detail', buildExpenseDetail({ details: 'Updated details' }));
      fixture.detectChanges();

      expect(component['editing']()).toBe(false);
    });

    // Code review C1 (defensive part): the parent (`OmegaViewerComponent`) is responsible for
    // noticing this component's destruction and self-healing its own `notesDirty`/
    // `notesEditing` mirrors — see `OmegaViewerComponent`'s `notesSection` viewChild effect and
    // its doc comment for why that could NOT be done from here via
    // `destroyRef.onDestroy(() => this.dirtyChange.emit(false))`: signal-based `output()`
    // marks itself destroyed before this component's own `onDestroy` callbacks run, so the
    // emit would silently no-op (`NG0953`). Covered at the shell level in
    // `omega-viewer.component.spec.ts` ("C1/M1/M2 — real note editing composed with
    // enterEditMode").
    it('emits editingChange(true) on startEdit and editingChange(false) on cancel', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));
      const emissions: boolean[] = [];
      component.editingChange.subscribe((v) => emissions.push(v));

      component['startEdit']();
      fixture.detectChanges();
      expect(emissions.at(-1)).toBe(true);

      component['onCancel']();
      fixture.detectChanges();
      expect(emissions.at(-1)).toBe(false);
    });

    it('resetEdit() closes local edit state without emitting cancelEdit or save', () => {
      setup(buildExpenseDetail({ details: 'Some details' }));
      let cancelled = false;
      let saved = false;
      component.cancelEdit.subscribe(() => (cancelled = true));
      component.save.subscribe(() => (saved = true));

      component['startEdit']();
      fixture.detectChanges();
      expect(component['editing']()).toBe(true);

      component.resetEdit();
      fixture.detectChanges();

      expect(component['editing']()).toBe(false);
      expect(cancelled).toBe(false);
      expect(saved).toBe(false);
    });

    it('renders the saveError message with role="alert" while editing', () => {
      setup(buildExpenseDetail());
      component['startEdit']();
      fixture.componentRef.setInput(
        'saveError',
        'Não foi possível salvar as alterações. Tente novamente.',
      );
      fixture.detectChanges();

      const alert = (fixture.nativeElement as HTMLElement).querySelector('.ew-alert[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain(
        'Não foi possível salvar as alterações. Tente novamente.',
      );
    });

    it('disables the Save button while saving() is true', () => {
      setup(buildExpenseDetail());
      component['startEdit']();
      fixture.componentRef.setInput('saving', true);
      fixture.detectChanges();

      const saveButton = (fixture.nativeElement as HTMLElement).querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
      expect(saveButton.textContent).toContain('Salvando...');
    });
  });

  describe('editable rendering (Subscription)', () => {
    it('shows an Edit button and allows editing, same as Expense', () => {
      setup(buildSubscriptionDetail({ details: null }));

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.vns__edit-btn')).not.toBeNull();

      root.querySelector<HTMLButtonElement>('.vns__edit-btn')?.click();
      fixture.detectChanges();

      expect(root.querySelector('textarea')).not.toBeNull();
    });
  });
});
