import { BrlCurrencyPipe } from './brl-currency.pipe';

const NBSP = '\u00A0';

describe('BrlCurrencyPipe', () => {
  let pipe: BrlCurrencyPipe;

  beforeEach(() => {
    pipe = new BrlCurrencyPipe();
  });

  it('formats a number as BRL', () => {
    expect(pipe.transform(99.9)).toBe(`R$${NBSP}99,90`);
  });

  it('formats zero', () => {
    expect(pipe.transform(0)).toBe(`R$${NBSP}0,00`);
  });
});
