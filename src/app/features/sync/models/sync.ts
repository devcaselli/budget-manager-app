/** Response of POST /sync/ingest — one bank-SMS ingest run for the authenticated owner. */
export interface SyncReport {
  readonly created: number;
  readonly skipped: number;
  readonly fallback: number;
  readonly errors: number;
}
