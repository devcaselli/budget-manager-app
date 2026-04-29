import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';

import { WalletDetailComponent } from '../../components/wallet-detail/wallet-detail.component';
import { WalletFormComponent } from '../../components/wallet-form/wallet-form.component';
import { WalletListComponent } from '../../components/wallet-list/wallet-list.component';
import { CreateWalletRequest, Wallet } from '../../models/wallet';
import { WalletService } from '../../services/wallet.service';
import { WalletPage } from './wallet-page';

class WalletServiceMock {
  findAll = vi.fn<() => Observable<Wallet[]>>();
  findById = vi.fn<(id: string) => Observable<Wallet>>();
  create = vi.fn<(request: CreateWalletRequest) => Observable<Wallet>>();
}

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

describe('WalletPage', () => {
  let service: WalletServiceMock;

  beforeEach(async () => {
    service = new WalletServiceMock();

    await TestBed.configureTestingModule({
      imports: [WalletPage],
      providers: [
        provideNoopAnimations(),
        { provide: WalletService, useValue: service },
      ],
    }).compileComponents();
  });

  it('should load wallets and select the first wallet with details', () => {
    service.findAll.mockReturnValue(of([wallet]));
    service.findById.mockReturnValue(of(walletDetails));

    const fixture = TestBed.createComponent(WalletPage);
    fixture.detectChanges();

    const detail = fixture.debugElement.query(By.directive(WalletDetailComponent))
      .componentInstance as WalletDetailComponent;

    expect(service.findAll).toHaveBeenCalledOnce();
    expect(service.findById).toHaveBeenCalledWith(wallet.id);
    expect(detail.wallet()?.remaining).toBe(walletDetails.remaining);
  });

  it('should not fetch details again when selected wallet is selected', () => {
    service.findAll.mockReturnValue(of([wallet]));
    service.findById.mockReturnValue(of(walletDetails));

    const fixture = TestBed.createComponent(WalletPage);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    list.walletSelect.emit(wallet);
    fixture.detectChanges();

    expect(service.findById).toHaveBeenCalledOnce();
  });

  it('should create a wallet and update child inputs', () => {
    const createdWallet: Wallet = {
      id: 'wallet-2',
      description: 'Maio 2026',
      budget: 3000,
      remaining: 3000,
      startDate: '2026-05-01',
      closedDate: null,
      closed: false,
    };
    const request: CreateWalletRequest = {
      description: createdWallet.description,
      budget: createdWallet.budget,
      startDate: createdWallet.startDate,
      closedDate: createdWallet.closedDate,
      closed: createdWallet.closed,
    };
    service.findAll.mockReturnValue(of([]));
    service.create.mockReturnValue(of(createdWallet));

    const fixture = TestBed.createComponent(WalletPage);
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(WalletFormComponent))
      .componentInstance as WalletFormComponent;
    form.walletCreate.emit(request);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    const detail = fixture.debugElement.query(By.directive(WalletDetailComponent))
      .componentInstance as WalletDetailComponent;

    expect(service.create).toHaveBeenCalledWith(request);
    expect(list.wallets()).toEqual([createdWallet]);
    expect(detail.wallet()).toEqual(createdWallet);
    expect(form.resetCount()).toBe(1);
  });

  it('should expose loading and error states when loading wallets fails', () => {
    const walletsSubject = new Subject<Wallet[]>();
    service.findAll.mockReturnValue(walletsSubject.asObservable());

    const fixture = TestBed.createComponent(WalletPage);
    fixture.detectChanges();

    const refreshButton = fixture.nativeElement.querySelector(
      '.wallet-page__header button',
    ) as HTMLButtonElement;
    expect(refreshButton.disabled).toBe(true);

    walletsSubject.error(new Error('Network error'));
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Nao foi possivel carregar as wallets.');
  });

  it('should expose an error state when creating a wallet fails', () => {
    const request: CreateWalletRequest = {
      description: 'Maio 2026',
      budget: 3000,
      startDate: '2026-05-01',
      closedDate: null,
      closed: false,
    };
    service.findAll.mockReturnValue(of([]));
    service.create.mockReturnValue(throwError(() => new Error('Server error')));

    const fixture = TestBed.createComponent(WalletPage);
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(WalletFormComponent))
      .componentInstance as WalletFormComponent;
    form.walletCreate.emit(request);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Nao foi possivel abrir a wallet.');
  });
});
