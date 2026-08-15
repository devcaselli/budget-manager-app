import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A single password requirement row, plus whether the current value satisfies it. */
export interface PasswordRule {
  readonly label: string;
  readonly met: boolean;
}

/**
 * Real backend password policy (`RegisterRequestDto.password` / Bean
 * Validation), confirmed byte-for-byte identical on
 * `ResetPasswordRequestDto.newPassword` — verified directly against the
 * backend's own plan doc (`backend-tasks.md`, Tema C / C3+C4: "política de
 * senha reaproveitada... copia literalmente as mesmas constraints Bean
 * Validation de `RegisterRequestDto.password` (min 12, max 128, `@Pattern`
 * letra+dígito)"), not assumed from the frontend task brief. Exported so a
 * consumer's own submit-guard can check `PASSWORD_MIN_LENGTH`/`_MAX_LENGTH`
 * without duplicating the literal numbers.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Evaluates the real backend password policy against a candidate password
 * (and, optionally, a confirmation value for the "matches" rule). Exported
 * as a standalone function — not just a method on the component — so a
 * submit handler can re-check "are all rules met" without reaching into the
 * component instance or re-deriving the regex/length checks itself.
 */
export function evaluatePasswordRules(password: string, confirm?: string): PasswordRule[] {
  const rules: PasswordRule[] = [
    {
      label: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} chars`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { label: 'At least 1 letter', met: /[A-Za-z]/.test(password) },
    { label: 'At least 1 digit', met: /[0-9]/.test(password) },
  ];

  if (confirm !== undefined) {
    rules.push({ label: 'Passwords match', met: password.length > 0 && password === confirm });
  }

  return rules;
}

/**
 * Presentational password-strength checklist + progress bar, driven purely
 * by `@Input()` signals — no `FormControl`/`ControlValueAccessor` wiring of
 * its own. The consuming form still owns its own `FormControl`s and
 * `valueChanges` subscriptions (same pattern `login-page.ts`'s signup form
 * already used pre-extraction); this component only renders the derived
 * rule state, computed via `evaluatePasswordRules()` so the rule logic
 * itself is reusable independent of the visual component too (a submit
 * handler needs the same boolean without rendering anything).
 *
 * Built against the REAL backend password policy (min 12 / max 128 / at
 * least 1 letter + 1 digit) — see `PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH`
 * doc comments above for the verification trail. Deliberately NOT reused by
 * `login-page.ts`'s signup form or `settings-page.ts`'s password-change stub:
 * both currently enforce a different, backend-incorrect client-side policy
 * (8+ chars, upper/lower/number/symbol/match — no explicit max, no letter+
 * digit pattern distinct from case). Retrofitting either of those forms to
 * this component would be a behavior change to already-shipped, already-
 * reviewed code, out of scope for the task that introduced this component
 * (F-C6) — flagged as tech debt instead of silently fixed here.
 */
@Component({
  selector: 'app-password-strength',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-strength.component.html',
  styleUrl: './password-strength.component.scss',
})
export class PasswordStrengthComponent {
  /** Current password value. Required — there is no meaningful "no password" render state. */
  readonly password = input.required<string>();

  /**
   * Optional confirm-password value. When provided, a "Passwords match" rule
   * is included; when omitted (e.g. a future non-double-entry consumer),
   * the rule set is just the 3 policy rules with no matching concern.
   */
  readonly confirm = input<string>();

  protected readonly rules = computed<PasswordRule[]>(() =>
    evaluatePasswordRules(this.password(), this.confirm()),
  );

  protected readonly allMet = computed(() => this.rules().every((r) => r.met));

  protected readonly strengthPercent = computed(() => {
    const rules = this.rules();
    return Math.round((rules.filter((r) => r.met).length / rules.length) * 100);
  });

  protected readonly strengthColor = computed(() => {
    const pct = this.strengthPercent();
    if (pct < 34) return 'var(--ew-bad)';
    if (pct < 67) return 'var(--ew-acc)';
    return 'var(--ew-teal)';
  });
}
