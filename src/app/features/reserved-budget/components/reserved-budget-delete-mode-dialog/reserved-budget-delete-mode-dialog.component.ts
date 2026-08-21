import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ReservedBudgetDeleteMode } from '../../models/reserved-budget';

/** One migration blocking submission of *both* delete modalities this month (RBM-F12, 3rd round —
 * the block is symmetric, never per-modality). `extraBudgetId` is what makes the chained
 * undo-and-end/skip shortcut (RBM-F12a) possible without a second lookup — the page already has
 * it in `ReservedBudgetListItem.migrations` (RBM-F4). */
export interface ReservedBudgetDeleteBlockingMigration {
  readonly extraBudgetId: string;
  readonly bulletLabel: string;
  /** Already formatted, for the per-line display. */
  readonly amount: string;
  /** Raw value, for the shortcut's summary total — never reparse `amount` (project convention;
   * see `ReservedBudgetMigrationView.amountValue`, the same pairing this data is sourced from). */
  readonly amountValue: number;
}

export interface ReservedBudgetDeleteModeDialogData {
  readonly description: string;
  /** Viewed month, already formatted (e.g. "Aug 2026"). Never `now()`. */
  readonly effectiveMonthLabel: string;
  /** Live migrations for the viewed month. Empty ⇒ both modalities free. Non-empty ⇒ both
   * blocked (3rd round — symmetric lock, see the module-level note on `deleteBlocked`). */
  readonly blockingMigrations: readonly ReservedBudgetDeleteBlockingMigration[];
}

export interface ReservedBudgetDeleteModeDialogResult {
  readonly mode: ReservedBudgetDeleteMode;
  /** `true` when the user picked the "Undo and end/skip" shortcut (RBM-F12a): the caller must
   * undo every `blockingMigrations` entry before applying `mode`. `false` on the normal path. */
  readonly undoBlockingMigrationsFirst: boolean;
}

/**
 * Deletes a reserved budget with an explicit choice between the two soft-delete modalities
 * (`END` / `SKIP_MONTH`), both symmetrically blocked when the viewed month has a live migration
 * (README, 3rd round — the double-count between Wallet and Bullet via `ExtraBudget` is not a
 * problem of the month being ended, it's a problem of every live month with a migration; the lock
 * is what makes `endMonth`'s "first dead month" semantics safe).
 *
 * New component, not an extension of the old `ReservedBudgetDeleteDialogComponent` — that dialog
 * had a `boolean` result and described exactly one modality in prose. This one has form state, a
 * blocked/free layout switch, and the chained-undo shortcut; extending would have meant rewriting
 * everything but the header and buttons under the old name, which is worse than a new name because
 * the old name would then lie about the contract. The old dialog is deleted in RBM-F13 once its
 * last caller is gone.
 */
@Component({
  selector: 'app-reserved-budget-delete-mode-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './reserved-budget-delete-mode-dialog.component.html',
  styleUrl: './reserved-budget-delete-mode-dialog.component.scss',
})
export class ReservedBudgetDeleteModeDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<ReservedBudgetDeleteModeDialogComponent, ReservedBudgetDeleteModeDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly data = inject<ReservedBudgetDeleteModeDialogData>(MAT_DIALOG_DATA);

  // No pre-selection: a destructive choice starts undecided on purpose (RBM-F12) — pre-selecting
  // A would convert hesitation into an accidental confirmation.
  protected readonly form = this.formBuilder.nonNullable.group({
    mode: this.formBuilder.control<ReservedBudgetDeleteMode | null>(null, Validators.required),
  });

  // toSignal(valueChanges), not a computed() reading the control's .value directly — the latter
  // is a plain mutable property, not itself a signal, so a computed() over it would never
  // re-run when the radio selection changes (same pattern as reserved-budget-migration-dialog's
  // amountValue, RBM-F5). initialValue matches the control's own starting value (null).
  protected readonly selectedMode = toSignal(this.form.controls.mode.valueChanges, {
    initialValue: this.form.controls.mode.value,
  });

  /**
   * Single lock for the whole dialog. Applies to BOTH modalities — decision recorded in the
   * README (double-count Wallet × Bullet via ExtraBudget touches every live month with a
   * migration, not just the one being ended). Do NOT reintroduce a per-modality variant: there is
   * no case where A is allowed and B isn't, or vice-versa.
   *
   * RBM-F12a correction: with the shortcut, the lock no longer disables the radios (the shortcut
   * needs to know *which* modality to apply after undoing) — it disables the primary submit
   * button instead. The radios stay selectable while `deleteBlocked()` is true; only `confirm()`
   * and the primary button are gated on it. This is the one way this task's implementation
   * departs from a plain reading of RBM-F12's own acceptance criteria, corrected explicitly by
   * RBM-F12a's own text ("Atualizar os critérios de aceite de RBM-F12 correspondentemente").
   */
  protected readonly deleteBlocked = computed(() => this.data.blockingMigrations.length > 0);

  protected readonly blockingTotalValue = computed(() =>
    this.data.blockingMigrations.reduce((sum, m) => sum + m.amountValue, 0),
  );

  protected readonly blockingTotalLabel = computed(() =>
    this.formatBrl(this.blockingTotalValue()),
  );

  protected readonly undoShortcutLabel = computed(() => {
    const mode = this.selectedMode();
    if (mode === null) return 'Undo migrations and continue';
    return mode === 'END' ? 'Undo and end' : 'Undo and skip';
  });

  protected readonly undoShortcutDisabled = computed(() => this.selectedMode() === null);

  // Summary line shown directly above the shortcut button — it IS the confirmation (RBM-F12a: no
  // second confirm dialog stacks on top of this one, since the dialog already lists every
  // migration that will be undone plus the modality that will follow). This dialog closes with a
  // result as soon as the shortcut is clicked (same principle as reserved-budget-migration-dialog,
  // RBM-F5) — the concatMap chain and its in-flight/progress state live entirely in the caller
  // (RBM-F13), which owns `ReservedBudgetService`. This component never injects it.
  protected readonly undoShortcutSummary = computed<string | null>(() => {
    const mode = this.selectedMode();
    if (mode === null) return null;

    const count = this.data.blockingMigrations.length;
    const plural = count === 1 ? 'migration' : 'migrations';
    const month = this.data.effectiveMonthLabel;
    const action = mode === 'END' ? `end this reserve from ${month}` : `skip ${month}`;

    return `This will undo ${count} ${plural} (${this.blockingTotalLabel()} total) and then ${action}.`;
  });

  protected confirm(): void {
    // Re-checked here even though the submit button is already disabled by deleteBlocked() — the
    // visual state is not the only barrier (same principle as the migration dialog, RBM-F5).
    if (this.form.invalid || this.deleteBlocked()) {
      this.form.markAllAsTouched();
      return;
    }

    const mode = this.form.getRawValue().mode;
    if (!mode) return;

    this.dialogRef.close({ mode, undoBlockingMigrationsFirst: false });
  }

  // Separate method so confirm() can never emit undoBlockingMigrationsFirst: true — the two
  // outcomes are structurally distinct call sites, not a shared branch that could regress.
  protected confirmWithUndo(): void {
    const mode = this.selectedMode();
    if (!mode) return;

    this.dialogRef.close({ mode, undoBlockingMigrationsFirst: true });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private formatBrl(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
}
