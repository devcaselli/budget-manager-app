import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import { WalletDetailComponent } from '../../components/wallet-detail/wallet-detail.component';
import { WalletFormComponent } from '../../components/wallet-form/wallet-form.component';
import { WalletListComponent } from '../../components/wallet-list/wallet-list.component';
import { CreateWalletRequest, PatchWalletRequest, Wallet } from '../../models/wallet';
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
  patch = vi.fn<(id: string, request: PatchWalletRequest) => Observable<Wallet>>();
}

const wallet: Wallet = {
  id: 'wallet-1',
  description: 'Abril 2026',
  budget: 5000,
  remaining: 3200,
  startDate: '2026-04-01',
  closedDate: null,
  closed: false,
  effectiveMonth: '2026-04',
  state: 'PRODUCTION',
};

const walletDetails: Wallet = {
  ...wallet,
  remaining: 3000,
};

describe('WalletPage', () => {
  let service: WalletServiceMock;
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = new WalletServiceMock();
    dialog = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WalletPage],
      providers: [
        provideNoopAnimations(),
        { provide: WalletService, useValue: service },
        { provide: MatDialog, useValue: dialog },
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
  effectiveMonth: '2026-04',
  state: 'PRODUCTION',
    };
    const request: CreateWalletRequest = {
      description: createdWallet.description,
      budget: createdWallet.budget,
      startDate: createdWallet.startDate,
      closedDate: createdWallet.closedDate,
      closed: createdWallet.closed,
      effectiveMonth: createdWallet.effectiveMonth,
      state: createdWallet.state,
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

    const detail = fixture.debugElement.query(By.directive(WalletDetailComponent))
      .componentInstance as WalletDetailComponent;
    expect(detail.isLoading()).toBe(true);

    service.errorSubject.next('Não foi possível carregar as wallets.');
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Não foi possível carregar as wallets.');
  });

  it('should expose an error state when creating a wallet fails', () => {
    const request: CreateWalletRequest = {
      description: 'Maio 2026',
      budget: 3000,
      startDate: '2026-05-01',
      closedDate: null,
      closed: false,
  effectiveMonth: '2026-04',
  state: 'PRODUCTION',
    };
    service.create.mockImplementation(() => {
      service.errorSubject.next('Não foi possível abrir a wallet.');
      return throwError(() => new Error('Server error'));
    });

    const fixture = TestBed.createComponent(WalletPage);
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(WalletFormComponent))
      .componentInstance as WalletFormComponent;
    form.walletCreate.emit(request);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Não foi possível abrir a wallet.');
  });

  it('should open the review dialog and patch + reload wallets when confirmed', () => {
    dialog.open.mockReturnValue({
      afterClosed: () => of(true),
    } as unknown as MatDialogRef<unknown, boolean>);
    service.patch.mockReturnValue(of({ ...wallet, state: 'REVIEW', closed: true }));

    const fixture = TestBed.createComponent(WalletPage);
    service.walletsSubject.next([wallet]);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    list.walletReview.emit(wallet);

    expect(dialog.open).toHaveBeenCalled();
    expect(service.patch).toHaveBeenCalledWith(wallet.id, {
      state: 'REVIEW',
      closed: true,
      closedDate: expect.any(String),
    });
    expect(service.loadWallets).toHaveBeenCalled();
  });

  it('should not patch the wallet when the review dialog is cancelled', () => {
    dialog.open.mockReturnValue({
      afterClosed: () => of(false),
    } as unknown as MatDialogRef<unknown, boolean>);

    const fixture = TestBed.createComponent(WalletPage);
    service.walletsSubject.next([wallet]);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    list.walletReview.emit(wallet);

    expect(dialog.open).toHaveBeenCalled();
    expect(service.patch).not.toHaveBeenCalled();
    expect(service.loadWallets).not.toHaveBeenCalled();
  });

  it('should expose an error state when sending a wallet to review fails', () => {
    dialog.open.mockReturnValue({
      afterClosed: () => of(true),
    } as unknown as MatDialogRef<unknown, boolean>);
    service.patch.mockImplementation(() => {
      service.errorSubject.next('Não foi possível atualizar a wallet.');
      return throwError(() => new Error('Server error'));
    });

    const fixture = TestBed.createComponent(WalletPage);
    service.walletsSubject.next([wallet]);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(WalletListComponent))
      .componentInstance as WalletListComponent;
    list.walletReview.emit(wallet);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Não foi possível atualizar a wallet.');
    expect(service.loadWallets).not.toHaveBeenCalled();
  });
});
