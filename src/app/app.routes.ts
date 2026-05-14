import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('@core/auth/login/login-page').then((c) => c.LoginPage),
    title: 'Sign in | Budget Manager',
  },
  {
    path: '',
    loadComponent: () =>
      import('@layout/shell/shell.component').then((c) => c.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/pages/dashboard-page/dashboard-page').then(
            (c) => c.DashboardPage,
          ),
        title: 'Dashboard | Budget Manager',
      },
      {
        path: 'wallets',
        loadComponent: () =>
          import('@features/wallet/pages/wallet-page/wallet-page').then(
            (c) => c.WalletPage,
          ),
        title: 'Wallets | Budget Manager',
      },
      {
        path: 'bullets',
        loadComponent: () =>
          import('@features/bullet/pages/bullet-page/bullet-page').then(
            (c) => c.BulletPage,
          ),
        title: 'Bullets | Budget Manager',
      },
      {
        path: 'expenses',
        loadComponent: () =>
          import('@features/expense/pages/expense-page/expense-page').then(
            (c) => c.ExpensePage,
          ),
        title: 'Expenses | Budget Manager',
      },
      {
        path: 'installments',
        loadComponent: () =>
          import('@features/installment/pages/installment-page/installment-page').then(
            (c) => c.InstallmentPage,
          ),
        title: 'Installments | Budget Manager',
      },
      {
        path: 'credit-cards',
        loadComponent: () =>
          import('@features/credit-card/pages/credit-card-page/credit-card-page').then(
            (c) => c.CreditCardPage,
          ),
        title: 'Credit Cards | Budget Manager',
      },
      {
        path: 'subscriptions',
        loadComponent: () =>
          import('@features/subscription/pages/subscription-page/subscription-page').then(
            (c) => c.SubscriptionPage,
          ),
        title: 'Subscriptions | Budget Manager',
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('@features/payment/pages/payment-page/payment-page').then(
            (c) => c.PaymentPage,
          ),
        title: 'Payments | Budget Manager',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('@features/settings/pages/settings-page/settings-page').then(
            (c) => c.SettingsPage,
          ),
        title: 'Settings | Budget Manager',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
