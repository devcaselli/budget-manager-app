/** Backend constraints (CreditCardPatchRequestDto / CreditCardRequestDto): max 20 items, each max 80 chars. */
export const MAX_LABELS = 20;
export const MAX_LABEL_LENGTH = 80;

/**
 * Parses a comma-separated text input into a deduplicated label array.
 * Trims whitespace, drops empty entries, enforces backend size limits client-side
 * so invalid input never reaches the API.
 */
export function parseLabelsInput(raw: string): readonly string[] {
  const labels = raw
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0 && label.length <= MAX_LABEL_LENGTH);

  return [...new Set(labels)].slice(0, MAX_LABELS);
}

/** Joins a label array back into the comma-separated text the input displays. */
export function formatLabelsInput(labels: readonly string[] | undefined): string {
  return (labels ?? []).join(', ');
}
