import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, finalize, Observable, tap } from 'rxjs';

import { environment } from '@environments/environment';

import { TagAccumulation } from '../models/tag-accumulation';

@Injectable({ providedIn: 'root' })
export class TagAccumulationService {
  private readonly http = inject(HttpClient);
  private readonly accumulationUrl = `${environment.apiUrl}/tags/accumulation`;

  private readonly accumulationSubject = new BehaviorSubject<TagAccumulation | null>(null);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly accumulation$ = this.accumulationSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  /** Fire-and-forget load — result lands on `accumulation$`/`error$`. Not paginated. */
  loadByWalletId(walletId: string): void {
    this.fetch(walletId).subscribe();
  }

  private fetch(walletId: string): Observable<TagAccumulation> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const params = new HttpParams().set('walletId', walletId);

    return this.http.get<TagAccumulation>(this.accumulationUrl, { params }).pipe(
      tap((result) => this.accumulationSubject.next(result)),
      catchError(() => {
        this.errorSubject.next('Não foi possível carregar os acúmulos por tag.');
        return EMPTY;
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }
}
