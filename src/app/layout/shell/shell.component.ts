import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { APP_NAVIGATION } from '@core/config/app-navigation';
import { APP_NAME } from '@core/config/app-config';
import { WalletService } from '@features/wallet/services/wallet.service';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly walletService = inject(WalletService);

  protected readonly isHandset = signal(false);
  protected readonly appName = APP_NAME;
  protected readonly navItems = APP_NAVIGATION;

  constructor() {
    this.walletService.loadWallets();

    this.breakpointObserver
      .observe([Breakpoints.Handset])
      .pipe(takeUntilDestroyed())
      .subscribe((result) => this.isHandset.set(result.matches));
  }
}
