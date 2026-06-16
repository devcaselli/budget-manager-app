import { formatBrl } from './currency';

const NBSP = '\u00A0';

describe('formatBrl', () => {
  it('formats a positive value as Brazilian Real', () => {
    expect(formatBrl(1234.5)).toBe(`R$${NBSP}1.234,50`);
  });

  it('formats zero', () => {
    expect(formatBrl(0)).toBe(`R$${NBSP}0,00`);
  });

  it('formats negative values', () => {
    expect(formatBrl(-10)).toBe(`-R$${NBSP}10,00`);
  });
});
