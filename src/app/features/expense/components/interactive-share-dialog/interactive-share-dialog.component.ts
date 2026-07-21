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
