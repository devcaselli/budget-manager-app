import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { Wallet } from '../../models/wallet';
import { WalletListComponent } from './wallet-list.component';

const productionWallet: Wallet = {
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

const reviewWallet: Wallet = {
  ...productionWallet,
  id: 'wallet-2',
  state: 'REVIEW',
};

describe('WalletListComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletListComponent],
    }).compileComponents();
  });

  it('should show the "Send to review" button for a PRODUCTION wallet', () => {
    const fixture = TestBed.createComponent(WalletListComponent);
    fixture.componentRef.setInput('wallets', [productionWallet]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.wl-review-btn');
    expect(button).toBeTruthy();
  });

  it('should hide the "Send to review" button for a non-PRODUCTION wallet', () => {
    const fixture = TestBed.createComponent(WalletListComponent);
    fixture.componentRef.setInput('wallets', [reviewWallet]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.wl-review-btn');
    expect(button).toBeNull();
  });

  it('should emit walletReview with the wallet and not trigger row selection', () => {
    const fixture = TestBed.createComponent(WalletListComponent);
    fixture.componentRef.setInput('wallets', [productionWallet]);
    fixture.detectChanges();

    let emitted: Wallet | undefined;
    let selected: Wallet | undefined;
    fixture.componentInstance.walletReview.subscribe((wallet) => (emitted = wallet));
    fixture.componentInstance.walletSelect.subscribe((wallet) => (selected = wallet));

    const button = fixture.debugElement.query(By.css('.wl-review-btn'));
    button.triggerEventHandler('click', new MouseEvent('click'));

    expect(emitted).toEqual(productionWallet);
    expect(selected).toBeUndefined();
  });
});
