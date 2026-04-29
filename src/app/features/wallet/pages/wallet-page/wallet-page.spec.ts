import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import { WalletDetailComponent } from '../../components/wallet-detail/wallet-detail.component';
import { WalletFormComponent } from '../../components/wallet-form/wallet-form.component';
import { WalletListComponent } from '../../components/wallet-list/wallet-list.component';
import { CreateWalletRequest, Wallet } from '../../models/wallet';
import { WalletService } from '../../services/wallet.service';
import { WalletPage } from './wallet-page';

class WalletServiceMock {
  readonly walletsSubject = new BehaviorSubject<readonly Wallet[]>([]);
  readonly selectedWalletSubject = new BehaviorSubject<Wallet | null>(null);
  readonly loadingSubject = new BehaviorSubject(false);
  readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly wallets$ = this.walletsSubject.asObservable();
  readonly selectedWallet$ = this.selectedWalletSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  loadWallets = vi.fn<() => void>();
  selectWallet = vi.fn<(wallet: Wallet) => void>();
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

  it('should render wallets and selected wallet from service streams', () => {
    const fixture = TestBed.createComponent(WalletPage);
    service.walletsSubject.next([wallet]);
    service.selectedWalletSubject.next(walletDetails);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    const detail = fixture.debugElement.query(By.directive(WalletDetailComponent))
      .componentInstance as WalletDetailComponent;

    expect(list.wallets()).toEqual([wallet]);
    expect(detail.wallet()?.remaining).toBe(walletDetails.remaining);
  });

  it('should call the service when selecting a wallet', () => {
    const fixture = TestBed.createComponent(WalletPage);
    service.walletsSubject.next([wallet]);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    list.walletSelect.emit(wallet);
    fixture.detectChanges();

    expect(service.selectWallet).toHaveBeenCalledWith(wallet);
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
    service.create.mockImplementation(() => {
      service.walletsSubject.next([createdWallet]);
      service.selectedWalletSubject.next(createdWallet);
      return of(createdWallet);
    });

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

  it('should expose loading and error states from the service', () => {
    const fixture = TestBed.createComponent(WalletPage);
    service.loadingSubject.next(true);
    fixture.detectChanges();

    const refreshButton = fixture.nativeElement.querySelector(
      '.wallet-page__header button',
    ) as HTMLButtonElement;
    expect(refreshButton.disabled).toBe(true);

    service.errorSubject.next('Nao foi possivel carregar as wallets.');
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
    service.create.mockImplementation(() => {
      service.errorSubject.next('Nao foi possivel abrir a wallet.');
      return throwError(() => new Error('Server error'));
    });

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
