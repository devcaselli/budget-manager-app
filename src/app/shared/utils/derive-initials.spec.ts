import { deriveInitials } from './derive-initials';

describe('deriveInitials', () => {
  it('derives 2-letter initials from a compound/multi-word name using the first two words', () => {
    expect(deriveInitials('Jean Paul Sartre')).toBe('JP');
    expect(deriveInitials('Victor Porto')).toBe('VP');
    expect(deriveInitials('Maria da Silva Santos')).toBe('MD');
  });

  it('derives a sane 1-char result from a single-word name', () => {
    expect(deriveInitials('Madonna')).toBe('M');
  });

  it('collapses internal repeated whitespace when splitting into words', () => {
    expect(deriveInitials('Jean   Paul   Sartre')).toBe('JP');
  });

  it('falls back to the email-derived initial when name is null/undefined/empty/whitespace-only', () => {
    expect(deriveInitials(null, 'victor@example.com')).toBe('V');
    expect(deriveInitials(undefined, 'victor@example.com')).toBe('V');
    expect(deriveInitials('', 'victor@example.com')).toBe('V');
    expect(deriveInitials('   ', 'victor@example.com')).toBe('V');
  });

  it('falls back to "?" when neither name nor emailFallback is usable', () => {
    expect(deriveInitials(null)).toBe('?');
    expect(deriveInitials(undefined)).toBe('?');
    expect(deriveInitials('')).toBe('?');
    expect(deriveInitials('   ')).toBe('?');
    expect(deriveInitials(null, '')).toBe('?');
    expect(deriveInitials(null, '   ')).toBe('?');
  });

  it('uppercases the result regardless of input casing', () => {
    expect(deriveInitials('jean paul')).toBe('JP');
    expect(deriveInitials('madonna')).toBe('M');
    expect(deriveInitials(null, 'victor@example.com')).toBe('V');
  });

  describe('grapheme-cluster correctness (emoji / combining marks)', () => {
    // A family emoji: a ZWJ (Zero-Width Joiner) sequence of 4 codepoints
    // (man + ZWJ + woman + ZWJ + girl + ZWJ + boy is the "full" family; this
    // is the 2-person "couple with heart" style sequence), spanning MULTIPLE
    // UTF-16 code units per codepoint AND multiple codepoints joined into one
    // visual grapheme. This is exactly the shape `Intl.Segmenter` exists to
    // handle correctly and naive indexing does not.
    const FAMILY_EMOJI = '\u{1F468}‍\u{1F469}‍\u{1F467}'; // 👨‍👩‍👧 man-ZWJ-woman-ZWJ-girl

    // An accented "e" built from a base letter + a COMBINING acute accent
    // (U+0065 "e" + U+0301 combining acute) rather than the single precomposed
    // codepoint U+00E9 — two codepoints, one visual grapheme.
    const COMBINING_ACCENT_NAME = 'éduardo'; // renders as "éduardo"

    it('PROVES naive charAt(0) indexing breaks on the family emoji (demonstrates the bug this function avoids)', () => {
      // charAt(0) returns only the first UTF-16 code unit of the leading
      // surrogate pair — not even a valid standalone character, let alone the
      // full visual emoji.
      const naive = FAMILY_EMOJI.charAt(0);
      expect(naive).not.toBe(FAMILY_EMOJI);
      expect(naive.length).toBe(1); // a lone unpaired surrogate half
    });

    it('PROVES naive [...string][0] (codepoint-aware but not grapheme-aware) also breaks on the ZWJ sequence', () => {
      // Spreading a string iterates by codepoint, which correctly grabs the
      // first full codepoint (the "man" emoji) — but a ZWJ sequence is SEVERAL
      // codepoints joined into one visual grapheme, so this still yields only
      // a fragment (just "👨"), not the complete family emoji.
      const naiveCodepointAware = [...FAMILY_EMOJI][0];
      expect(naiveCodepointAware).not.toBe(FAMILY_EMOJI);
    });

    it('derives the correct, unbroken initial from a name starting with a multi-codepoint emoji grapheme cluster', () => {
      const name = `${FAMILY_EMOJI} Household`;
      const result = deriveInitials(name);

      // Whole grapheme cluster preserved intact, not a broken surrogate half.
      expect(result.startsWith(FAMILY_EMOJI)).toBe(true);
      expect(result).toBe(`${FAMILY_EMOJI}H`.toUpperCase());
    });

    it('does not split a combining-mark accented character into a bare base letter', () => {
      // Naive charAt(0) would return just "e" (dropping the combining accent
      // entirely from view, since it's a separate code unit rendered by the
      // following character) — Intl.Segmenter keeps "é" joined.
      const naive = COMBINING_ACCENT_NAME.charAt(0);
      expect(naive).toBe('e'); // proves the naive approach silently drops the accent mark

      const result = deriveInitials(COMBINING_ACCENT_NAME);
      expect(result).toBe(COMBINING_ACCENT_NAME.slice(0, 2).toUpperCase());
      expect(result.length).toBe(2); // base letter + combining mark kept together, not split
    });
  });

  it('handles a name at the real 50-char backend maximum without crashing, producing sane initials', () => {
    // Backend's real enforced bound (RegisterRequestDto: @Size(min=2, max=50)),
    // confirmed in F-B2/F-B3 — NOT the plan doc's original 60-char estimate.
    const name50 = 'A'.repeat(25) + ' ' + 'B'.repeat(24); // 50 chars total
    expect(name50.length).toBe(50);

    expect(() => deriveInitials(name50)).not.toThrow();
    expect(deriveInitials(name50)).toBe('AB');
  });

  it('handles a single-word name at the real 50-char backend maximum', () => {
    const singleWord50 = 'A'.repeat(50);
    expect(() => deriveInitials(singleWord50)).not.toThrow();
    expect(deriveInitials(singleWord50)).toBe('A');
  });
});
