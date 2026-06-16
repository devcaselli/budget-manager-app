import { BrDatePipe } from './br-date.pipe';

describe('BrDatePipe', () => {
  let pipe: BrDatePipe;

  beforeEach(() => {
    pipe = new BrDatePipe();
  });

  it('formats an ISO date as dd/mm/yyyy in UTC', () => {
    expect(pipe.transform('2026-05-09')).toBe('09/05/2026');
  });

  it('returns the fallback label for null', () => {
    expect(pipe.transform(null)).toBe('Sem fechamento');
  });

  it('does not shift the day due to timezone', () => {
    // Parsed at T00:00:00Z with a UTC formatter — must stay on the same day.
    expect(pipe.transform('2026-01-01')).toBe('01/01/2026');
  });
});
