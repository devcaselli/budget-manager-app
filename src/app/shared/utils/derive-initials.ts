/**
 * Grapheme-aware segmenter shared by every call — `Intl.Segmenter` instances
 * are stateless and safe to reuse, so building one per invocation would be
 * wasted allocation on a function that may run per render of the user chip.
 */
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** First grapheme cluster of a non-empty string (never a broken surrogate half / combining mark). */
function firstGrapheme(value: string): string {
  const first = GRAPHEME_SEGMENTER.segment(value)[Symbol.iterator]().next();
  return first.done ? '' : first.value.segment;
}

/**
 * Derives the shell's 1-2 character initials chip from a real display name,
 * falling back to the account email when there is no name on file.
 *
 * Algorithm (confirmed per Sword & Shield plan doc, decision 6):
 * - 2+ words → first grapheme of the first word + first grapheme of the
 *   second word (e.g. "Jean Paul Sartre" → "JP" — the 3rd+ word is ignored,
 *   matching the "first two words" rule, not "first + last").
 * - Exactly 1 word → its first grapheme, doubled up is NOT done — a single
 *   grapheme is a perfectly sane 1-char result for e.g. "Madonna" → "M".
 * - Empty/whitespace-only/null/undefined name → first grapheme of
 *   `emailFallback` (trimmed), or "?" if that is also absent/blank.
 *
 * Uses `Intl.Segmenter` (grapheme granularity) instead of `charAt(0)`/array
 * indexing so a name starting with an emoji or an accented character built
 * from combining marks (multi-UTF-16-code-unit grapheme clusters) yields the
 * whole visual character, not half of a surrogate pair or a bare combining
 * mark rendered as mojibake.
 *
 * Pure and O(1) in practice: `Intl.Segmenter` only needs to produce the first
 * one or two grapheme clusters, not walk the full string — cost does not grow
 * with the real 50-char backend max on `displayName`.
 */
export function deriveInitials(name: string | null | undefined, emailFallback?: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter((word) => word.length > 0);

  if (words.length >= 2) {
    return (firstGrapheme(words[0]) + firstGrapheme(words[1])).toUpperCase();
  }

  if (words.length === 1) {
    return firstGrapheme(words[0]).toUpperCase();
  }

  const trimmedEmail = emailFallback?.trim();
  if (trimmedEmail) {
    return firstGrapheme(trimmedEmail).toUpperCase();
  }

  return '?';
}
