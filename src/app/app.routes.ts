import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('@features/dashboard/pages/dashboard-page/dashboard-page').then(
        (component) => component.DashboardPage,
      ),
    title: 'Dashboard | Budget Manager',
  },
  {
    path: 'wallets',
    loadComponent: () =>
      import('@features/wallet/pages/wallet-page/wallet-page').then(
        (component) => component.WalletPage,
      ),
    title: 'Wallets | Budget Manager',
  },
  {
    path: 'bullets',
    loadComponent: () =>
      import('@features/bullet/pages/bullet-page/bullet-page').then(
        (component) => component.BulletPage,
      ),
    title: 'Bullets | Budget Manager',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
