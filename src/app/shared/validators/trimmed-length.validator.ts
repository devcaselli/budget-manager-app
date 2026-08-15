import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates a string control's LENGTH AFTER TRIMMING leading/trailing
 * whitespace, rather than Angular's built-in `Validators.minLength` /
 * `maxLength`, which measure the raw (untrimmed) value.
 *
 * Without this, a whitespace-only value (e.g. `'   '`) or a value that only
 * clears the minimum once padding is stripped (e.g. `' A '`) evaluates
 * `control.invalid === false`, even though the trimmed payload actually sent
 * to the backend would fail its `@NotBlank`/`@Size` validation — leaving the
 * live UI (error message, submit-button `[disabled]` state) looking valid
 * right up until a confusing server-side rejection.
 *
 * Shared by the signup form (`login-page.ts`) and the settings profile form
 * (`settings-page.ts`), which enforce the identical backend contract
 * (`@NotBlank`, `@Size(min=2, max=50)`) — a single source of truth instead of
 * duplicating the bounds/trim logic in each component's submit handler.
 */
export function trimmedLengthValidator(min: number, max: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const trimmedLength = (control.value ?? '').trim().length;

    if (trimmedLength === 0) {
      return { required: true };
    }
    if (trimmedLength < min) {
      return { minlength: { requiredLength: min, actualLength: trimmedLength } };
    }
    if (trimmedLength > max) {
      return { maxlength: { requiredLength: max, actualLength: trimmedLength } };
    }
    return null;
  };
}
