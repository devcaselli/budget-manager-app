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
];
