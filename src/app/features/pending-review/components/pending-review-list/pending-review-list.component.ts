import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';

import { PendingReview } from '../../models/pending-review';

/** Mirrors backend's InstallmentNumberPolicy range (same bounds used across the app). */
const MIN_INSTALLMENT_NUMBER = 2;
const MAX_INSTALLMENT_NUMBER = 120;

/** Debounce before emitting a `rename` — avoids one PATCH per keystroke. */
const RENAME_DEBOUNCE_MS = 400;

/** Dumb list of pending reviews. Renders per-item inline edit controls and emits
 * events for the smart layer to translate into `PendingReviewService` calls — never
 * injects the service itself. */
@Component({
  selector: 'app-pending-review-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BrlCurrencyPipe],
  templateUrl: './pending-review-list.component.html',
  styleUrl: './pending-review-list.component.scss',
})
export class PendingReviewListComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly items = input.required<readonly PendingReview[]>();
  /** Per-item error message from the last batch confirm (Task 6 populates this;
   * kept empty/absent until then so the contract doesn't need to change later). */
  readonly errorsById = input<ReadonlyMap<string, string>>(new Map());

  readonly rename = output<{ id: string; value: string }>();
  readonly toggleInstallment = output<{ id: string; enabled: boolean }>();
  readonly setInstallmentNumber = output<{ id: string; value: number }>();
  readonly toggleSelected = output<string>();
  readonly discard = output<string>();
  readonly confirmSelected = output<readonly string[]>();

  /** Selection lives here — "selected" isn't part of the domain model. Checked by default,
   * so this tracks opt-outs (unchecked ids) rather than opt-ins — a freshly arrived item
   * (not yet in this set either way) reads as selected without extra wiring. */
  protected readonly deselectedIds = signal<ReadonlySet<string>>(new Set());
  /** Installment toggle is local until the backend confirms the patch (Task 3 doesn't
   * receive it back on the model — it's inferred from `installmentNumber !== null`,
   * but the user can flip the toggle before typing a number). */
  protected readonly installmentEnabledIds = signal<ReadonlySet<string>>(new Set());

  /** One FormControl per item id, debounced independently before emitting `rename`. */
  private readonly nameControls = new Map<string, FormControl<string>>();
  private readonly renameEmitted = new Subject<{ id: string; value: string }>();

  constructor() {
    this.renameEmitted.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.rename.emit(event);
    });
  }

  protected nameControlFor(item: PendingReview): FormControl<string> {
    const existing = this.nameControls.get(item.id);
    if (existing) {
      return existing;
    }

    const control = new FormControl(item.resolvedName, { nonNullable: true });
    control.valueChanges
      .pipe(debounceTime(RENAME_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.renameEmitted.next({ id: item.id, value }));

    this.nameControls.set(item.id, control);
    return control;
  }

  protected isSelected(id: string): boolean {
    return !this.deselectedIds().has(id);
  }

  protected isInstallment(item: PendingReview): boolean {
    return this.installmentEnabledIds().has(item.id) || item.installmentNumber !== null;
  }

  protected errorFor(item: PendingReview): string | undefined {
    return this.errorsById().get(item.id);
  }

  protected onToggleSelected(id: string): void {
    const next = new Set(this.deselectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.deselectedIds.set(next);
    this.toggleSelected.emit(id);
  }

  protected onToggleInstallment(item: PendingReview): void {
    const enabled = !this.isInstallment(item);
    const next = new Set(this.installmentEnabledIds());
    if (enabled) {
      next.add(item.id);
    } else {
      next.delete(item.id);
    }
    this.installmentEnabledIds.set(next);
    this.toggleInstallment.emit({ id: item.id, enabled });
  }

  protected onInstallmentNumberChange(item: PendingReview, rawValue: string): void {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < MIN_INSTALLMENT_NUMBER || value > MAX_INSTALLMENT_NUMBER) {
      return;
    }
    this.setInstallmentNumber.emit({ id: item.id, value });
  }

  protected onDiscard(item: PendingReview): void {
    this.discard.emit(item.id);
  }

  protected onConfirmSelected(): void {
    const ids = this.items()
      .map((item) => item.id)
      .filter((id) => this.isSelected(id));
    this.confirmSelected.emit(ids);
  }

  protected readonly minInstallmentNumber = MIN_INSTALLMENT_NUMBER;
  protected readonly maxInstallmentNumber = MAX_INSTALLMENT_NUMBER;
}
