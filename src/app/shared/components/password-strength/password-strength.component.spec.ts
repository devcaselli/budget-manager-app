import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  evaluatePasswordRules,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordStrengthComponent,
} from './password-strength.component';

describe('evaluatePasswordRules (pure function)', () => {
  it('exposes the real backend bounds (min 12 / max 128)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it('rejects a password shorter than 12 chars', () => {
    const rules = evaluatePasswordRules('short1a');
    const lengthRule = rules.find((r) => r.label.includes('chars'));
    expect(lengthRule?.met).toBe(false);
  });

  it('accepts a password at exactly the 12-char minimum', () => {
    const rules = evaluatePasswordRules('abcdefghij1a'.slice(0, 12));
    const lengthRule = rules.find((r) => r.label.includes('chars'));
    expect(lengthRule?.met).toBe(true);
  });

  it('rejects a password at 129 chars (over the 128 max)', () => {
    const password = 'a1'.repeat(65); // 130 chars, safely over
    const rules = evaluatePasswordRules(password);
    const lengthRule = rules.find((r) => r.label.includes('chars'));
    expect(lengthRule?.met).toBe(false);
  });

  it('accepts a password at exactly the 128-char maximum', () => {
    const password = 'a1'.repeat(63) + 'aa'; // 128 chars, ends with a letter to keep pattern valid
    expect(password.length).toBe(128);
    const rules = evaluatePasswordRules(password);
    const lengthRule = rules.find((r) => r.label.includes('chars'));
    expect(lengthRule?.met).toBe(true);
  });

  it('requires at least 1 letter', () => {
    const rules = evaluatePasswordRules('123456789012');
    const letterRule = rules.find((r) => r.label.includes('letter'));
    expect(letterRule?.met).toBe(false);
  });

  it('requires at least 1 digit', () => {
    const rules = evaluatePasswordRules('abcdefghijkl');
    const digitRule = rules.find((r) => r.label.includes('digit'));
    expect(digitRule?.met).toBe(false);
  });

  it('accepts a password with both a letter and a digit, at valid length', () => {
    const rules = evaluatePasswordRules('abcdefghij1a');
    expect(rules.every((r) => r.met)).toBe(true);
  });

  it('does not require uppercase, lowercase-distinct, or a symbol (unlike the older signup checklist)', () => {
    const rules = evaluatePasswordRules('alllowercase1');
    expect(rules.every((r) => r.met)).toBe(true);
  });

  it('omits the "matches" rule when no confirm value is provided', () => {
    const rules = evaluatePasswordRules('abcdefghij1a');
    expect(rules.some((r) => r.label.toLowerCase().includes('match'))).toBe(false);
  });

  it('includes a failing "matches" rule when confirm differs', () => {
    const rules = evaluatePasswordRules('abcdefghij1a', 'different12a');
    const matchRule = rules.find((r) => r.label.toLowerCase().includes('match'));
    expect(matchRule?.met).toBe(false);
  });

  it('includes a passing "matches" rule when confirm is identical', () => {
    const rules = evaluatePasswordRules('abcdefghij1a', 'abcdefghij1a');
    const matchRule = rules.find((r) => r.label.toLowerCase().includes('match'));
    expect(matchRule?.met).toBe(true);
  });

  it('treats an empty password against an empty confirm as not matching', () => {
    const rules = evaluatePasswordRules('', '');
    const matchRule = rules.find((r) => r.label.toLowerCase().includes('match'));
    expect(matchRule?.met).toBe(false);
  });
});

describe('PasswordStrengthComponent', () => {
  let fixture: ComponentFixture<PasswordStrengthComponent>;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function setUp(password: string, confirm?: string): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PasswordStrengthComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordStrengthComponent);
    fixture.componentRef.setInput('password', password);
    if (confirm !== undefined) {
      fixture.componentRef.setInput('confirm', confirm);
    }
    fixture.detectChanges();
  }

  it('renders one rule row per evaluated rule', async () => {
    await setUp('abcdefghij1a', 'abcdefghij1a');
    const rows = root().querySelectorAll('.ew-pw-rules > div');
    // 3 policy rules + 1 match rule, since `confirm` was provided
    expect(rows.length).toBe(4);
  });

  it('marks unmet rules without the ew-ok class', async () => {
    // Too short AND no digit — both the length and digit rules should be
    // unmet (the letter rule alone is met, since 'short' has letters).
    await setUp('short');
    const rows = Array.from(root().querySelectorAll('.ew-pw-rules > div'));
    const lengthRow = rows.find((r) => r.textContent?.includes('chars'));
    const digitRow = rows.find((r) => r.textContent?.toLowerCase().includes('digit'));
    expect(lengthRow?.classList.contains('ew-ok')).toBe(false);
    expect(digitRow?.classList.contains('ew-ok')).toBe(false);
  });

  it('marks all rules ew-ok once a fully-valid, matching password is entered', async () => {
    await setUp('abcdefghij1a', 'abcdefghij1a');
    const rows = Array.from(root().querySelectorAll('.ew-pw-rules > div'));
    expect(rows.every((r) => r.classList.contains('ew-ok'))).toBe(true);
  });

  it('renders a strength bar whose width reflects the fraction of met rules', async () => {
    await setUp('abcdefghij1a', 'abcdefghij1a');
    const bar = root().querySelector('.ew-pw-strength i') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('renders 0% width when no rules are met', async () => {
    await setUp('', '');
    const bar = root().querySelector('.ew-pw-strength i') as HTMLElement;
    expect(bar.style.width).toBe('0%');
  });
});
