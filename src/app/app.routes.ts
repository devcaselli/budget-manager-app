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
    path: 'expenses',
    loadComponent: () =>
      import('@features/expense/pages/expense-page/expense-page').then(
        (component) => component.ExpensePage,
      ),
    title: 'Expenses | Budget Manager',
  },
  {
    path: 'subscriptions',
    loadComponent: () =>
      import('@features/subscription/pages/subscription-page/subscription-page').then(
        (component) => component.SubscriptionPage,
      ),
    title: 'Subscriptions | Budget Manager',
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('@features/payment/pages/payment-page/payment-page').then(
        (component) => component.PaymentPage,
      ),
    title: 'Payments | Budget Manager',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
