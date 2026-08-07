import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { OmegaViewerDetail } from '../models/omega-viewer-detail';

/** Local edit form shape — a single `details` textarea, always a non-nullable `string`. */
type NotesForm = FormGroup<{ details: FormControl<string> }>;

/**
 * Notes section (F-08) — displays/edits the `details` field for all 3 Omega Viewer item
 * kinds, rendered underneath `ViewerFieldListComponent` while the shell is in `VIEW` mode.
 *
 * Editable for Expense/Subscription, read-only for Installment (product decision confirmed
 * with Victor: Installment notes stay exclusively editable via the pre-existing standalone
 * `InstallmentNotesDialogComponent`, outside the viewer — this component never links to it,
 * that dialog stays fully out of this task's scope).
 *
 * **Mode ownership**: this component owns its OWN local `form` signal (non-null only while
 * actively editing) instead of the shell's `OmegaViewerMode` (`'VIEW' | 'EDIT'`). Reasons:
 *   1. The shell's `mode` is hard-restricted to Expense (`enterEditMode` no-ops for any other
 *      kind) and, when `'EDIT'`, replaces the ENTIRE body with `ViewerEditFormComponent` —
 *      which already has its own `details` textarea covering the full-record-edit case. This
 *      section only ever renders while the shell is in `VIEW` (see the shell template), so
 *      there is no overlap/double-editor risk for Expense.
 *   2. Subscription has no full-record edit form in the viewer at all — piggy-backing on the
 *      shell's binary mode would require either widening `enterEditMode` to a kind this task
 *      never asked for, or inventing a third mode value on the shell. A component-local signal
 *      keeps the shell's `OmegaViewerMode` exactly as scoped as F-07 left it, while still
 *      letting Subscription notes be editable.
 *
 * What IS reused from the shell's F-07 pattern, deliberately, so the UX stays consistent:
 *   - the same dirty-guard concept — `dirtyChange` output mirrors `ViewerEditFormComponent`'s,
 *     letting the shell fold notes-dirtiness into the same `guardDirty()`/`disableClose` path
 *     already used for the full Expense edit form (one source of truth for "is anything
 *     unsaved right now" in the shell, not two independent ones);
 *   - the same save/cancel/saving/saveError input-output shape, and the same
 *     `role="alert"`-rendered save-failure message.
 */
@Component({
  selector: 'app-viewer-notes-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './viewer-notes-section.component.html',
  styleUrl: './viewer-notes-section.component.scss',
})
export class ViewerNotesSectionComponent {
  private readonly formBuilder = inject(FormBuilder);
  /** Captured here (constructor = injection context) so `startEdit()` — called from a
   * template click handler, not an injection context — can still scope its `valueChanges`
   * subscription to this component's lifetime via `takeUntilDestroyed(this.destroyRef)`. */
  private readonly destroyRef = inject(DestroyRef);

  readonly detail = input.required<OmegaViewerDetail>();
  /** Disables the Save button while a patch request is in flight — shell-owned, same as
   * `ViewerEditFormComponent.saving`. */
  readonly saving = input(false);
  /** Shell-owned message for the most recent failed save attempt, rendered with
   * `role="alert"` — same convention as `ViewerEditFormComponent.saveError`. */
  readonly saveError = input<string | null>(null);

  /** Emits the trimmed new note text on save. Always a plain `string` (possibly empty) —
   * unlike `ViewerEditFormComponent`'s multi-field diff/patch, this section only ever touches
   * one field, so there's nothing to conditionally omit; the shell decides how to turn this
   * into a patch request per-kind. */
  readonly save = output<string>();
  readonly cancelEdit = output<void>();
  /** Fires whenever local edit state changes dirty-ness — mirrors
   * `ViewerEditFormComponent.dirtyChange` so the shell can fold it into the same guard. */
  readonly dirtyChange = output<boolean>();

  /** Read-only for Installment (product decision, see class doc) — Expense/Subscription are
   * editable. */
  protected readonly isEditable = computed(() => this.detail().kind !== 'INSTALLMENT');

  /** Non-`null` only while actively editing — built fresh on every `startEdit()` call rather
   * than kept as a permanent group, since this section's edit state is local/transient (no
   * need for it to exist at all while just displaying). A signal (not a plain field) so the
   * template's `editing()` read stays reactive under `OnPush`. */
  private readonly formSignal = signal<NotesForm | null>(null);
  protected readonly editing = computed(() => this.formSignal() !== null);
  /** Exposed for the template's `[formGroup]` binding — non-null only while `editing()`. */
  protected readonly form = computed(() => this.formSignal());

  constructor() {
    // Any new `detail()` (successful save, or navigation to a different item) closes local
    // edit state so a stale form never lingers across items — same spirit as
    // `ViewerEditFormComponent`'s re-seeding effect.
    effect(() => {
      this.detail();
      this.closeEdit();
    });
  }

  protected startEdit(): void {
    if (!this.isEditable()) {
      return;
    }
    const form = this.formBuilder.nonNullable.group({ details: this.detail().details ?? '' });
    form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.dirtyChange.emit(form.dirty));
    this.formSignal.set(form);
  }

  protected submit(): void {
    const form = this.formSignal();
    if (!form) {
      return;
    }
    this.save.emit(form.getRawValue().details.trim());
  }

  protected onCancel(): void {
    this.closeEdit();
    this.cancelEdit.emit();
  }

  private closeEdit(): void {
    this.formSignal.set(null);
    this.dirtyChange.emit(false);
  }
}
