import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { switchMap } from 'rxjs';

import { BrlCurrencyPipe } from '@shared/pipes/brl-currency.pipe';
import { Payer } from '@features/payer/models/payer';
import { PayerService } from '@features/payer/services/payer.service';
import { CreateShareRequest, Share } from '@features/share/models/share';
import { ShareService } from '@features/share/services/share.service';

/**
 * Task 5 (frontend-tasks.md, improvement-shares) decision: this dialog deliberately does
 * NOT get the PERCENT split mode that `ShareFormComponent` (Task 4) has. Four reasons,
 * checked and closed on 2026-07-27 — do not reopen by inertia ("the other form has it, so
 * should this one"):
 *
 * 1. It solves nothing here. This dialog always creates exactly ONE quota (see `submit()`
 *    below) — with N=1, "70%" and "R$ 700 of R$ 1000" are the same information typed on a
 *    different keypad. The actual value PERCENT mode adds is splitting across N people
 *    without doing the arithmetic yourself; that value is zero at N=1. `ownerAmount()`
 *    (below) is already auto-computed as `cost - amount`, which is the whole point PERCENT
 *    mode would otherwise buy.
 * 2. It's the highest-risk place to add it. This dialog creates EXPENSE-sourced shares
 *    exclusively (`buildRequest()`'s `sourceType: 'EXPENSE'`) — the one source type
 *    affected by the `Expense.pay()` cent-exact debt (see
 *    `expense_pay_cent_exact_blocks_percentage_shares` in the tech-debt wiki). Adding a
 *    percent→R$ conversion here, of all places, would plant that bug in the app's
 *    most-used sharing entry point for a UX gain that's already zero per point 1.
 * 3. Real, non-trivial cost. This dialog shares no code with `ShareFormComponent` — its
 *    own form, its own 3-step wizard, its own validation (`Validators.max(cost)`).
 *    PERCENT mode here would be new, duplicated implementation, not reuse.
 * 4. Out of scope. The plan's scope was "the create-share form on SharePage" — this
 *    dialog was never named.
 *
 * Task 5 also re-verified this dialog after Tasks 1 and 4 changed things it depends on
 * (`Share.sourceName` added to the model; `ShareService.create()`'s error message now
 * extracts the backend's `detail` field instead of always showing the generic one) — no
 * production code change was needed; this file's only diff for Task 5 is this comment.
 */
export interface InteractiveShareDialogExpense {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly currency: string;
}

export interface InteractiveShareDialogData {
  readonly walletId: string;
  readonly expense: InteractiveShareDialogExpense;
  readonly payers: readonly Payer[];
}

export type InteractiveShareDialogResult = Share;

/** UI-only payer selection mode. NEW creates a real Payer record, then is sent to the
 * backend as an EXISTING quota using the freshly-created payer's id. */
type PayerSelectionMode = 'EXISTING' | 'NEW' | 'TRANSIENT';

type WizardStep = 0 | 1 | 2;

const STEP_LABELS = ['Payer', 'Amount', 'Done'] as const;

/**
 * First letter of a payer name, upper-cased, for the design's initial-avatar disc.
 *
 * Uses the spread form rather than `name[0]`, so a name whose first character is outside the
 * BMP (an emoji, some scripts) yields the whole code point instead of a broken half of a
 * surrogate pair. Falls back to '?' for an empty/placeholder name — the same character the
 * design's own `(s.splitPayer || '?')[0]` falls back to.
 */
function payerInitialOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '—') {
    return '?';
  }
  return ([...trimmed][0] ?? '?').toUpperCase();
}

@Component({
  selector: 'app-interactive-share-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule, ReactiveFormsModule, BrlCurrencyPipe],
  templateUrl: './interactive-share-dialog.component.html',
  styleUrl: './interactive-share-dialog.component.scss',
})
export class InteractiveShareDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<InteractiveShareDialogComponent, InteractiveShareDialogResult>
  >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly shareService = inject(ShareService);
  private readonly payerService = inject(PayerService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = inject<InteractiveShareDialogData>(MAT_DIALOG_DATA);

  protected readonly stepLabels = STEP_LABELS;
  protected readonly currentStep = signal<WizardStep>(0);
  protected readonly createdShare = signal<Share | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    mode: ['EXISTING' as PayerSelectionMode, Validators.required],
    payerId: [''],
    newPayerName: [''],
    transientName: [''],
    transientPaymentDate: [''],
    amount: [
      0,
      [Validators.required, Validators.min(0.01), Validators.max(this.data.expense.cost)],
    ],
  });

  protected readonly modeValue = toSignal(this.form.controls.mode.valueChanges, {
    initialValue: this.form.controls.mode.getRawValue(),
  });
  protected readonly payerIdValue = toSignal(this.form.controls.payerId.valueChanges, {
    initialValue: this.form.controls.payerId.getRawValue(),
  });
  protected readonly newPayerNameValue = toSignal(this.form.controls.newPayerName.valueChanges, {
    initialValue: this.form.controls.newPayerName.getRawValue(),
  });
  protected readonly transientNameValue = toSignal(this.form.controls.transientName.valueChanges, {
    initialValue: this.form.controls.transientName.getRawValue(),
  });
  protected readonly amountValue = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.getRawValue(),
  });

  protected readonly ownerAmount = computed(() =>
    Math.max(Number((this.data.expense.cost - (this.amountValue() || 0)).toFixed(2)), 0),
  );

  /** Post-epic-audit P3-B2: design (line ~1213) offers 3 one-tap amount shortcuts on the
   *  amount step — half, all, or a third of the expense cost — so the common split ratios
   *  don't require typing/calculating by hand. Recomputed off `data.expense.cost`, which is
   *  fixed for the dialog's lifetime (not a signal), so this is a plain readonly array, not
   *  a `computed()`. */
  protected readonly amountShortcuts: readonly { label: string; value: number }[] = [
    { label: '50 / 50', value: this.round2(this.data.expense.cost / 2) },
    { label: 'All of it', value: this.round2(this.data.expense.cost) },
    { label: 'A third', value: this.round2(this.data.expense.cost / 3) },
  ];

  /** Mirrors the design's `splitFull` state: once the payer's share covers the whole cost,
   *  the owner's remaining `ownerAmount()` hits 0 and `Expense.pay()`'s 100%-passed-on rule
   *  (see the class doc above re: cent-exact debt) hides the expense from the active cycle —
   *  surfaced here so the user isn't surprised when it vanishes from the ledger after submit. */
  protected readonly isFullyPassedOn = computed(
    () => this.amountValue() > 0 && this.ownerAmount() === 0,
  );

  protected readonly selectedPayer = computed<Payer | null>(
    () => this.data.payers.find((payer) => payer.id === this.payerIdValue()) ?? null,
  );

  protected readonly payerDisplayName = computed(() => {
    switch (this.modeValue()) {
      case 'TRANSIENT':
        return this.transientNameValue()?.trim() || '—';
      case 'NEW':
        return this.newPayerNameValue()?.trim() || '—';
      default:
        return this.selectedPayer()?.name ?? '—';
    }
  });

  /**
   * D11: the design identifies a payer by an initial-avatar disc (a circle carrying the first
   * letter of the name) in both step 1's list and step 2's confirmation chip, rather than a
   * generic person glyph. Rendering is `aria-hidden` in the template — the full name always
   * sits next to it, so the initial is decoration and must not be announced twice.
   */
  protected readonly payerInitial = computed(() => payerInitialOf(this.payerDisplayName()));

  /**
   * Per-row initial for step 1's payer list. A plain O(1) string call, not a signal: it is
   * keyed by the row's own name rather than component state, and `data.payers` is a fixed
   * readonly input that never changes for the life of the dialog, so there is nothing to
   * memoize across change-detection runs.
   */
  protected payerInitialFor(name: string): string {
    return payerInitialOf(name);
  }

  protected readonly isSaving = toSignal(this.shareService.saving$, { initialValue: false });
  protected readonly isSavingPayer = toSignal(this.payerService.saving$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.shareService.error$, { initialValue: null });
  protected readonly payerErrorMessage = toSignal(this.payerService.error$, { initialValue: null });

  protected selectMode(mode: PayerSelectionMode): void {
    this.form.controls.mode.setValue(mode);

    if (mode !== 'EXISTING') {
      this.form.controls.payerId.setValue('');
    }
    if (mode !== 'TRANSIENT') {
      this.form.controls.transientName.setValue('');
      this.form.controls.transientPaymentDate.setValue('');
    }
    if (mode !== 'NEW') {
      this.form.controls.newPayerName.setValue('');
    }
  }

  protected selectPayer(payerId: string): void {
    this.form.controls.payerId.setValue(payerId);
    this.currentStep.set(1);
  }

  protected continueTransient(): void {
    const name = this.form.controls.transientName.getRawValue().trim();
    if (!name) {
      this.form.controls.transientName.markAsTouched();
      return;
    }
    this.currentStep.set(1);
  }

  protected continueNewPayer(): void {
    const name = this.form.controls.newPayerName.getRawValue().trim();
    if (!name) {
      this.form.controls.newPayerName.markAsTouched();
      return;
    }
    this.currentStep.set(1);
  }

  protected goBackToPayer(): void {
    this.currentStep.set(0);
  }

  protected applyAmountShortcut(value: number): void {
    this.form.controls.amount.setValue(value);
    this.form.controls.amount.markAsTouched();
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    if (value.mode === 'NEW') {
      this.payerService
        .save({
          name: value.newPayerName.trim(),
          type: 'STANDING',
          paymentDate: this.today(),
        })
        .pipe(
          switchMap((payer) => this.shareService.create(this.buildRequest({ payerId: payer.id }, value.amount))),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (created) => {
            this.createdShare.set(created);
            this.currentStep.set(2);
          },
          error: () => undefined,
        });
      return;
    }

    const quota =
      value.mode === 'TRANSIENT'
        ? {
            transient_: {
              name: value.transientName.trim(),
              ...(value.transientPaymentDate ? { paymentDate: value.transientPaymentDate } : {}),
            },
          }
        : { payerId: value.payerId };

    this.shareService
      .create(this.buildRequest(quota, value.amount))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.createdShare.set(created);
          this.currentStep.set(2);
        },
        error: () => undefined,
      });
  }

  private buildRequest(
    quota:
      | { payerId: string }
      | { transient_: { name: string; paymentDate?: string } },
    amount: number,
  ): CreateShareRequest {
    return {
      walletId: this.data.walletId,
      sourceType: 'EXPENSE',
      sourceId: this.data.expense.id,
      totalAmount: this.data.expense.cost,
      currency: this.data.expense.currency,
      ownerShare: this.ownerAmount(),
      quotas: [{ ...quota, amount }],
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  protected close(): void {
    this.dialogRef.close(this.createdShare() ?? undefined);
  }
}
