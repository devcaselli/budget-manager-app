import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Bullet, CreateBulletRequest, UpdateBulletRequest } from '../models/bullet';
import { BulletService } from './bullet.service';

describe('BulletService', () => {
  let service: BulletService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(BulletService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify({ ignoreCancelled: true });
  });

  it('should return bullets by wallet id via GET /api/bullets/wallet/:walletId', () => {
    const bullets: Bullet[] = [
      {
        id: 'bullet-1',
        description: 'Alimentacao',
        budget: 800,
        remaining: 500,
        walletId: 'wallet-1',
      },
    ];

    service.findByWalletId('wallet-1').subscribe((result) => expect(result).toEqual(bullets));

    const request = httpMock.expectOne('/api/bullets/wallet/wallet-1');
    expect(request.request.method).toBe('GET');
    request.flush(bullets);
  });

  it('should populate bullets$ with loadByWalletId API response', () => {
    const bullets: Bullet[] = [
      {
        id: 'bullet-1',
        description: 'Alimentacao',
        budget: 800,
        remaining: 500,
        walletId: 'wallet-1',
      },
    ];
    const emittedBullets: (readonly Bullet[])[] = [];

    service.bullets$.subscribe((value) => emittedBullets.push(value));
    service.loadByWalletId('wallet-1');

    const request = httpMock.expectOne('/api/bullets/wallet/wallet-1');
    expect(request.request.method).toBe('GET');
    request.flush(bullets);

    expect(emittedBullets.at(-1)).toEqual(bullets);
  });

  it('should create a bullet and prepend it to bullets$', () => {
    const input: CreateBulletRequest = {
      description: 'Moradia',
      budget: 1500,
      walletId: 'wallet-1',
    };
    const bullet: Bullet = {
      id: 'bullet-2',
      description: input.description,
      budget: input.budget,
      remaining: input.budget,
      walletId: input.walletId,
    };
    const emittedBullets: (readonly Bullet[])[] = [];

    service.bullets$.subscribe((value) => emittedBullets.push(value));
    service.create(input).subscribe((result) => expect(result).toEqual(bullet));

    const request = httpMock.expectOne('/api/bullets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(bullet);

    expect(emittedBullets.at(-1)).toEqual([bullet]);
  });

  it('should update a bullet via PATCH and replace it in bullets$', () => {
    const existing: Bullet = {
      id: 'bullet-1',
      description: 'Alimentacao',
      budget: 800,
      remaining: 500,
      walletId: 'wallet-1',
    };
    const input: UpdateBulletRequest = {
      description: 'Mercado',
      budget: 1000,
      walletId: 'wallet-1',
    };
    const updated: Bullet = {
      id: 'bullet-1',
      description: 'Mercado',
      budget: 1000,
      remaining: 700,
      walletId: 'wallet-1',
    };
    const emittedBullets: (readonly Bullet[])[] = [];

    service.bullets$.subscribe((value) => emittedBullets.push(value));
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/bullets/wallet/wallet-1').flush([existing]);

    service.update(existing.id, input).subscribe((result) => expect(result).toEqual(updated));

    const request = httpMock.expectOne('/api/bullets/bullet-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(input);
    request.flush(updated);

    expect(emittedBullets.at(-1)).toEqual([updated]);
  });

  it('should expose an error message and clear updating state when PATCH fails', () => {
    const existing: Bullet = {
      id: 'bullet-1',
      description: 'Alimentacao',
      budget: 800,
      remaining: 500,
      walletId: 'wallet-1',
    };
    const emittedErrors: (string | null)[] = [];
    const emittedUpdatingIds: (string | null)[] = [];

    service.error$.subscribe((value) => emittedErrors.push(value));
    service.updating$.subscribe((value) => emittedUpdatingIds.push(value));

    service
      .update(existing.id, { description: 'X', budget: 10, walletId: 'wallet-1' })
      .subscribe({ error: () => undefined });

    httpMock
      .expectOne('/api/bullets/bullet-1')
      .flush(null, { status: 400, statusText: 'Bad Request' });

    expect(emittedErrors.at(-1)).toBe('Não foi possível atualizar o bullet.');
    expect(emittedUpdatingIds.at(-1)).toBeNull();
  });

  it('should delete a bullet and remove it from bullets$', () => {
    const bullet: Bullet = {
      id: 'bullet-1',
      description: 'Alimentacao',
      budget: 800,
      remaining: 500,
      walletId: 'wallet-1',
    };
    const emittedBullets: (readonly Bullet[])[] = [];

    service.bullets$.subscribe((value) => emittedBullets.push(value));
    service.loadByWalletId('wallet-1');
    httpMock.expectOne('/api/bullets/wallet/wallet-1').flush([bullet]);

    service.delete(bullet.id).subscribe();

    const request = httpMock.expectOne('/api/bullets/bullet-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    expect(emittedBullets.at(-1)).toEqual([]);
  });
});
