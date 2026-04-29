import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CreateWalletRequest, Wallet } from '../models/wallet';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(WalletService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should return all wallets via GET /api/wallets', () => {
    const wallets: Wallet[] = [
      {
        id: 'wallet-1',
        description: 'Abril 2026',
        budget: 5000,
        remaining: 3200,
        startDate: '2026-04-01',
        closedDate: null,
        closed: false,
      },
    ];

    service.findAll().subscribe((result) => expect(result).toEqual(wallets));

    const request = httpMock.expectOne('/api/wallets');
    expect(request.request.method).toBe('GET');
    request.flush(wallets);
  });

  it('should return a wallet by id via GET /api/wallets/:id', () => {
    const wallet: Wallet = {
      id: 'wallet-1',
      description: 'Abril 2026',
      budget: 5000,
      remaining: 3200,
      startDate: '2026-04-01',
      closedDate: null,
      closed: false,
    };

    service.findById(wallet.id).subscribe((result) => expect(result).toEqual(wallet));

    const request = httpMock.expectOne('/api/wallets/wallet-1');
    expect(request.request.method).toBe('GET');
    request.flush(wallet);
  });

  it('should create a wallet via POST /api/wallets', () => {
    const input: CreateWalletRequest = {
      description: 'Maio 2026',
      budget: 3000,
      startDate: '2026-05-01',
      closedDate: null,
      closed: false,
    };
    const wallet: Wallet = {
      id: 'wallet-2',
      description: 'Maio 2026',
      budget: input.budget,
      remaining: 3000,
      startDate: input.startDate,
      closedDate: input.closedDate,
      closed: input.closed,
    };

    service.create(input).subscribe((result) => expect(result).toEqual(wallet));

    const request = httpMock.expectOne('/api/wallets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(wallet);
  });

  it('should propagate HTTP errors', () => {
    service.findAll().subscribe({
      next: () => expect.fail('Expected request to fail'),
      error: (error: unknown) => expect(error).toBeTruthy(),
    });

    const request = httpMock.expectOne('/api/wallets');
    request.flush({ message: 'Internal server error' }, { status: 500, statusText: 'Server Error' });
  });
});
