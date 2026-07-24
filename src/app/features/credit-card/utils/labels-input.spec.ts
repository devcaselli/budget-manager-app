import { formatLabelsInput, MAX_LABEL_LENGTH, MAX_LABELS, parseLabelsInput } from './labels-input';

describe('parseLabelsInput', () => {
  it('splits comma-separated text into trimmed labels', () => {
    expect(parseLabelsInput('Uniclass, Nu Mastercard ,  Itaú ')).toEqual([
      'Uniclass',
      'Nu Mastercard',
      'Itaú',
    ]);
  });

  it('drops empty entries from stray commas', () => {
    expect(parseLabelsInput('Uniclass,, ,Nu')).toEqual(['Uniclass', 'Nu']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseLabelsInput('')).toEqual([]);
    expect(parseLabelsInput('   ')).toEqual([]);
  });

  it('deduplicates labels', () => {
    expect(parseLabelsInput('Uniclass, Uniclass, uniclass')).toEqual(['Uniclass', 'uniclass']);
  });

  it('drops labels longer than the backend max length', () => {
    const tooLong = 'a'.repeat(MAX_LABEL_LENGTH + 1);
    expect(parseLabelsInput(`Uniclass, ${tooLong}`)).toEqual(['Uniclass']);
  });

  it('keeps labels at exactly the max length', () => {
    const exact = 'a'.repeat(MAX_LABEL_LENGTH);
    expect(parseLabelsInput(exact)).toEqual([exact]);
  });

  it('caps the result at the backend max item count', () => {
    const many = Array.from({ length: MAX_LABELS + 5 }, (_, i) => `label${i}`).join(',');
    expect(parseLabelsInput(many)).toHaveLength(MAX_LABELS);
  });
});

describe('formatLabelsInput', () => {
  it('joins labels with a comma and space', () => {
    expect(formatLabelsInput(['Uniclass', 'Nu Mastercard'])).toBe('Uniclass, Nu Mastercard');
  });

  it('returns an empty string for undefined or empty labels', () => {
    expect(formatLabelsInput(undefined)).toBe('');
    expect(formatLabelsInput([])).toBe('');
  });
});
