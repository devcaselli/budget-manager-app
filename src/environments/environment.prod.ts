export const environment = {
  production: true,
  apiUrl: 'http://localhost:8081',
  // Never expose sandbox connectors in production.
  pluggyIncludeSandbox: false,
} as const;
