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
import { LoadingCounter } from '@core/state/loading-counter';

import { Bullet, CreateBulletRequest, UpdateBulletRequest } from '../models/bullet';

@Injectable({
  providedIn: 'root',
})
export class BulletService {
  private readonly http = inject(HttpClient);
  private readonly bulletsUrl = `${environment.apiUrl}/bullets`;

  private readonly bulletsSubject = new BehaviorSubject<readonly Bullet[]>([]);
  private readonly loadingCounter = new LoadingCounter();
  private readonly savingSubject = new BehaviorSubject(false);
  private readonly updatingSubject = new BehaviorSubject<string | null>(null);
  private readonly deletingSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadBulletsTrigger$ = new Subject<string | null>();

  readonly bullets$ = this.bulletsSubject.asObservable();
  readonly loading$ = this.loadingCounter.loading$;
  readonly saving$ = this.savingSubject.asObservable();
  readonly updating$ = this.updatingSubject.asObservable();
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

          this.loadingCounter.start();
        }),
        switchMap((walletId) => {
          if (!walletId) {
            return EMPTY;
          }

          return this.findByWalletId(walletId).pipe(
            tap((bullets) => this.bulletsSubject.next(bullets)),
            catchError(() => {
              this.errorSubject.next('Não foi possível carregar os bullets.');
              return EMPTY;
            }),
            finalize(() => this.loadingCounter.stop()),
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
          error: () => this.errorSubject.next('Não foi possível criar o bullet.'),
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

  update(id: string, input: UpdateBulletRequest): Observable<Bullet> {
    const updatedBulletSubject = new ReplaySubject<Bullet>(1);

    this.updatingSubject.next(id);
    this.errorSubject.next(null);

    this.http
      .patch<Bullet>(`${this.bulletsUrl}/${id}`, input)
      .pipe(
        tap({
          next: (bullet) => {
            const currentBullets = this.bulletsSubject.getValue();
            this.bulletsSubject.next(
              currentBullets.map((currentBullet) =>
                currentBullet.id === bullet.id ? bullet : currentBullet,
              ),
            );
          },
          error: () => this.errorSubject.next('Não foi possível atualizar o bullet.'),
        }),
        finalize(() => this.updatingSubject.next(null)),
      )
      .subscribe({
        next: (bullet) => {
          updatedBulletSubject.next(bullet);
          updatedBulletSubject.complete();
        },
        error: (error: unknown) => updatedBulletSubject.error(error),
      });

    return updatedBulletSubject.asObservable();
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
          error: () => this.errorSubject.next('Não foi possível remover o bullet.'),
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
}
