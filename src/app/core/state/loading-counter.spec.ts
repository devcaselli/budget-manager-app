import { LoadingCounter } from './loading-counter';

describe('LoadingCounter', () => {
  let counter: LoadingCounter;

  beforeEach(() => {
    counter = new LoadingCounter();
  });

  it('starts not loading', () => {
    expect(counter.isLoading).toBe(false);
  });

  it('is loading after a single start', () => {
    counter.start();
    expect(counter.isLoading).toBe(true);
  });

  it('stays loading until every start is matched by a stop', () => {
    counter.start();
    counter.start();
    counter.stop();

    expect(counter.isLoading).toBe(true);

    counter.stop();
    expect(counter.isLoading).toBe(false);
  });

  it('never goes negative when stop is called more than start', () => {
    counter.stop();
    counter.stop();
    expect(counter.isLoading).toBe(false);

    counter.start();
    expect(counter.isLoading).toBe(true);
  });

  it('emits the loading transitions in order', () => {
    const states: boolean[] = [];
    counter.loading$.subscribe((value) => states.push(value));

    counter.start();
    counter.stop();

    expect(states).toEqual([false, true, false]);
  });
});
