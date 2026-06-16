import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Reference-counted loading flag. Emits `true` while one or more operations are
 * in flight and `false` once all have settled. Shared by feature services that
 * fire overlapping requests, so a finished request never clears the flag while
 * another is still pending.
 */
export class LoadingCounter {
  private readonly loadingSubject = new BehaviorSubject(false);
  private activeRequests = 0;

  readonly loading$: Observable<boolean> = this.loadingSubject.asObservable();

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  start(): void {
    this.activeRequests += 1;
    this.loadingSubject.next(true);
  }

  stop(): void {
    this.activeRequests = Math.max(this.activeRequests - 1, 0);
    this.loadingSubject.next(this.activeRequests > 0);
  }
}
