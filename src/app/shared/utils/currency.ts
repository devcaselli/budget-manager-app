const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Format a number as Brazilian Real. Single shared Intl instance. */
export function formatBrl(value: number): string {
  return brlFormatter.format(value);
}
