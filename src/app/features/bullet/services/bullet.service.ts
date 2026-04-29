import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  finalize,
  Observable,
  ReplaySubject,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '@environments/environment';

import { Bullet, CreateBulletRequest } from '../models/bullet';

@Injectable({
  providedIn: 'root',
})
export class BulletService {
  private readonly http = inject(HttpClient);
  private readonly bulletsUrl = `${environment.apiUrl}/bullets`;

  private readonly bulletsSubject = new BehaviorSubject<readonly Bullet[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadBulletsTrigger$ = new Subject<string | null>();
  private activeLoadingRequests = 0;

  readonly bullets$ = this.bulletsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly deleting$ = this.deletingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    this.loadBulletsTrigger$
      .pipe(
        tap((walletId) => {
          this.errorSubject.next(null);

          if (!walletId) {
            this.bulletsSubject.next([]);
            return;
          }

          this.startLoading();
        }),
        switchMap((walletId) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId).pipe(
            tap((bullets) => this.bulletsSubject.next(bullets)),
            catchError(() => {
              this.errorSubject.next('Nao foi possivel carregar os bullets.');
              return EMPTY;
            }),
            finalize(() => this.stopLoading()),
          );
        }),
      )
      .subscribe();
  }

  findByWalletId(walletId: string): Observable<Bullet[]> {
    return this.http.get<Bullet[]>(`${this.bulletsUrl}/wallet/${walletId}`);
  }

  create(input: CreateBulletRequest): Observable<Bullet> {
    const createdBulletSubject = new ReplaySubject<Bullet>(1);

    this.savingSubject.next(true);
    this.errorSubject.next(null);

    this.http
      .post<Bullet>(this.bulletsUrl, input)
      .pipe(
        tap({
          next: (bullet) => {
            const currentBullets = this.bulletsSubject.getValue();
            this.bulletsSubject.next([
              bullet,
              ...currentBullets.filter((currentBullet) => currentBullet.id !== bullet.id),
            ]);
          },
          error: () => this.errorSubject.next('Nao foi possivel criar o bullet.'),
        }),
        finalize(() => this.savingSubject.next(false)),
      )
      .subscribe({
        next: (bullet) => {
          createdBulletSubject.next(bullet);
          createdBulletSubject.complete();
        },
        error: (error: unknown) => createdBulletSubject.error(error),
      });

    return createdBulletSubject.asObservable();
  }

  delete(id: string): Observable<void> {
    const deletedBulletSubject = new ReplaySubject<void>(1);

    this.deletingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .delete<void>(`${this.bulletsUrl}/${id}`)
      .pipe(
        tap({
          next: () => {
            const currentBullets = this.bulletsSubject.getValue();
            this.bulletsSubject.next(currentBullets.filter((bullet) => bullet.id !== id));
          },
          error: () => this.errorSubject.next('Nao foi possivel remover o bullet.'),
        }),
        finalize(() => this.deletingSubject.next(null)),
      )
      .subscribe({
        next: () => {
          deletedBulletSubject.next();
          deletedBulletSubject.complete();
        },
        error: (error: unknown) => deletedBulletSubject.error(error),
      });

    return deletedBulletSubject.asObservable();
  }

  loadByWalletId(walletId: string | null): void {
    this.loadBulletsTrigger$.next(walletId);
  }

  private startLoading(): void {
    this.activeLoadingRequests += 1;
    this.loadingSubject.next(true);
  }

  private stopLoading(): void {
    this.activeLoadingRequests = Math.max(this.activeLoadingRequests - 1, 0);
    this.loadingSubject.next(this.activeLoadingRequests > 0);
  }
}
