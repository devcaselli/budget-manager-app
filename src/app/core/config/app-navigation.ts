import { NavigationItem } from '@core/models/navigation-item';

export const APP_NAVIGATION: readonly NavigationItem[] = [
  {
    label: 'Dashboard',
    route: '/dashboard',
    icon: 'dashboard',
    exact: true,
  },
  {
    label: 'Wallets',
    route: '/wallets',
    icon: 'account_balance_wallet',
  },
  {
    label: 'Bullets',
    route: '/bullets',
    icon: 'track_changes',
  },
  {
    label: 'Expenses',
    route: '/expenses',
    icon: 'receipt_long',
  },
  {
    label: 'Subscriptions',
    route: '/subscriptions',
    icon: 'subscriptions',
  },
  {
    label: 'Payments',
    route: '/payments',
    icon: 'payments',
  },
];
