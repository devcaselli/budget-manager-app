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

  it('should emit an empty wallet array as the initial state', () => {
    let emittedWallets: readonly Wallet[] | undefined;

    service.wallets$.subscribe((wallets) => {
      emittedWallets = wallets;
    });

    expect(emittedWallets).toEqual([]);
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

  it('should populate wallets$ with loadWallets API response', () => {
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
    const emittedWallets: (readonly Wallet[])[] = [];

    service.wallets$.subscribe((value) => emittedWallets.push(value));
    service.loadWallets();

    const request = httpMock.expectOne('/api/wallets');
    expect(request.request.method).toBe('GET');
    request.flush(wallets);

    expect(emittedWallets.at(-1)).toEqual(wallets);
  });

  it('should set loading$ while loadWallets is pending and unset it when finished', () => {
    const loadingStates: boolean[] = [];

    service.loading$.subscribe((value) => loadingStates.push(value));
    service.loadWallets();

    expect(loadingStates).toEqual([false, true]);

    const request = httpMock.expectOne('/api/wallets');
    request.flush([]);

    expect(loadingStates).toEqual([false, true, false]);
  });

  it('should set error$ when loadWallets fails', () => {
    const errors: (string | null)[] = [];

    service.error$.subscribe((value) => errors.push(value));
    service.loadWallets();

    const request = httpMock.expectOne('/api/wallets');
    request.flush({ message: 'Internal server error' }, { status: 500, statusText: 'Server Error' });

    expect(errors.at(-1)).toBe('Nao foi possivel carregar as wallets.');
  });

  it('should populate selectedWallet$ with selectWallet API response', () => {
    const wallet: Wallet = {
      id: 'wallet-1',
      description: 'Abril 2026',
      budget: 5000,
      remaining: 3200,
      startDate: '2026-04-01',
      closedDate: null,
      closed: false,
    };
    const walletDetails: Wallet = {
      ...wallet,
      remaining: 3000,
    };
    const selectedWallets: (Wallet | null)[] = [];

    service.selectedWallet$.subscribe((value) => selectedWallets.push(value));
    service.selectWallet(wallet);

    const request = httpMock.expectOne('/api/wallets/wallet-1');
    expect(request.request.method).toBe('GET');
    request.flush(walletDetails);

    expect(selectedWallets.at(-1)).toEqual(walletDetails);
  });

  it('should add created wallet to the beginning of wallets$', () => {
    const currentWallet: Wallet = {
      id: 'wallet-1',
      description: 'Abril 2026',
      budget: 5000,
      remaining: 3200,
      startDate: '2026-04-01',
      closedDate: null,
      closed: false,
    };
    const createdWallet: Wallet = {
      id: 'wallet-2',
      description: 'Maio 2026',
      budget: 3000,
      remaining: 3000,
      startDate: '2026-05-01',
      closedDate: null,
      closed: false,
    };
    const input: CreateWalletRequest = {
      description: createdWallet.description,
      budget: createdWallet.budget,
      startDate: createdWallet.startDate,
      closedDate: createdWallet.closedDate,
      closed: createdWallet.closed,
    };
    const emittedWallets: (readonly Wallet[])[] = [];

    service.wallets$.subscribe((value) => emittedWallets.push(value));
    service.loadWallets();
    httpMock.expectOne('/api/wallets').flush([currentWallet]);

    service.create(input).subscribe();
    const request = httpMock.expectOne('/api/wallets');
    request.flush(createdWallet);

    expect(emittedWallets.at(-1)).toEqual([createdWallet, currentWallet]);
  });
});
