export const environment = {
  production: false,
  apiUrl: '/api',
  // Dev-only: exposes Pluggy sandbox connectors (e.g. "Pluggy Bank") in the Connect widget.
  pluggyIncludeSandbox: true,
} as const;
