import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OmegaViewerFieldRow, OmegaViewerRemainingBadge } from '../models/omega-viewer-field-row';
import { ViewerFieldListComponent } from './viewer-field-list.component';

describe('ViewerFieldListComponent', () => {
  let fixture: ComponentFixture<ViewerFieldListComponent>;

  function setup(rows: readonly OmegaViewerFieldRow[], remainingBadge?: OmegaViewerRemainingBadge): void {
    TestBed.configureTestingModule({ imports: [ViewerFieldListComponent] });
    fixture = TestBed.createComponent(ViewerFieldListComponent);
    fixture.componentRef.setInput('rows', rows);
    if (remainingBadge) {
      fixture.componentRef.setInput('remainingBadge', remainingBadge);
    }
    fixture.detectChanges();
  }

  it('renders one label/value row per input row, in order', () => {
    setup([
      { key: 'a', label: 'Data', value: '01/01/2026', sensitive: false },
      { key: 'b', label: 'Cartão', value: 'Nubank', sensitive: false },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const labels = Array.from(root.querySelectorAll('.vfl__label')).map((el) => el.textContent?.trim());
    const values = Array.from(root.querySelectorAll('.vfl__value')).map((el) => el.textContent?.trim());

    expect(labels).toEqual(['Data', 'Cartão']);
    expect(values).toEqual(['01/01/2026', 'Nubank']);
  });

  it('applies .ew-blur only to rows marked sensitive', () => {
    setup([
      { key: 'cost', label: 'Valor', value: 'R$ 100,00', sensitive: true },
      { key: 'status', label: 'Status', value: 'OPEN', sensitive: false },
    ]);

    const values = (fixture.nativeElement as HTMLElement).querySelectorAll('.vfl__value');

    expect(values[0].classList.contains('ew-blur')).toBe(true);
    expect(values[1].classList.contains('ew-blur')).toBe(false);
  });

  it('renders nothing for the badge when remainingBadge is {kind: "none"} (default)', () => {
    setup([]);

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="remaining-badge-paid"]')).toBeNull();
    expect(root.querySelector('[data-testid="remaining-badge-open"]')).toBeNull();
  });

  it('renders the "fully paid" badge distinctly when remaining count is 0', () => {
    setup([], { kind: 'remaining', count: 0 });

    const root = fixture.nativeElement as HTMLElement;
    const paidBadge = root.querySelector('[data-testid="remaining-badge-paid"]');
    const openBadge = root.querySelector('[data-testid="remaining-badge-open"]');

    expect(paidBadge).not.toBeNull();
    expect(paidBadge?.classList.contains('ew-pill--paid')).toBe(true);
    // 0 and "no badge" must never render the same way — this asserts the paid badge is the
    // ONLY one shown, not a fallthrough of the open-badge template branch.
    expect(openBadge).toBeNull();
  });

  it('renders the "N remaining" badge distinctly when remaining count is > 0', () => {
    setup([], { kind: 'remaining', count: 4 });

    const root = fixture.nativeElement as HTMLElement;
    const openBadge = root.querySelector('[data-testid="remaining-badge-open"]');
    const paidBadge = root.querySelector('[data-testid="remaining-badge-paid"]');

    expect(openBadge).not.toBeNull();
    expect(openBadge?.classList.contains('ew-pill--open')).toBe(true);
    expect(openBadge?.textContent).toContain('4');
    expect(paidBadge).toBeNull();
  });

  it('renders 0-remaining and no-badge (null) as observably different DOM states', () => {
    TestBed.configureTestingModule({ imports: [ViewerFieldListComponent] });

    const noneFixture = TestBed.createComponent(ViewerFieldListComponent);
    noneFixture.componentRef.setInput('rows', []);
    noneFixture.componentRef.setInput('remainingBadge', { kind: 'none' });
    noneFixture.detectChanges();

    const zeroFixture = TestBed.createComponent(ViewerFieldListComponent);
    zeroFixture.componentRef.setInput('rows', []);
    zeroFixture.componentRef.setInput('remainingBadge', { kind: 'remaining', count: 0 });
    zeroFixture.detectChanges();

    const noneRoot = noneFixture.nativeElement as HTMLElement;
    const zeroRoot = zeroFixture.nativeElement as HTMLElement;

    expect(noneRoot.querySelector('.ew-pill')).toBeNull();
    expect(zeroRoot.querySelector('.ew-pill')).not.toBeNull();
  });
});
