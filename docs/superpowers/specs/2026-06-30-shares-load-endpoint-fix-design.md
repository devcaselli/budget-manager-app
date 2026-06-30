# Fix: Shares load endpoint mismatch (Interactive Shares + share-page)

**Date:** 2026-06-30
**Scope:** Frontend-only (`budget-manager-app`). No backend changes.

## Context

The "Interactive Shares" feature (a wizard modal on `ExpensePage` rows that creates a
`Share` for an expense) and the existing `/share` page both rely on `ShareService` to keep a
`shares$` stream of the owner's shares. Two bugs were reported and kept recurring:

- **Bug A** — Shares created via the wizard never appear in the `/share` page list, and the
  page's "Source" dropdown never excludes expenses that already have an active share.
- **Bug B** — On `ExpensePage`, the "split" button reappears on an expense that already has an
  active share (its `hasShare` flag is always `false`).

## Root cause (single, confirmed against backend code)

`ShareService.loadByWalletId(walletId)` calls **`GET /wallets/{walletId}/shares`** — an endpoint
that **does not exist** in the backend. The backend's `ShareController` (`@RequestMapping("/shares")`)
exposes only:

| Method | Path | Purpose |
|---|---|---|
| POST | `/shares` | create |
| POST | `/shares/{id}/revert` | revert |
| GET | `/shares/{id}` | find one |
| GET | `/shares/active?sourceType=&sourceId=` | find active share by source |
| GET | `/shares` | **find all shares by owner** (no wallet/month/status filter) |

So every `loadByWalletId` call returned 404, swallowed by the service's `catchError`, leaving
`shares$` as `[]`. The only thing that ever populated `shares$` was the optimistic push inside
`create()`. A prior "reload after create" fix made it worse: it triggered the 404 GET that
wiped the optimistic entry.

`GET /shares` returns **all** of the owner's shares (ACTIVE + REVERTED, every wallet, no month
scoping). `Share.walletId` is stored verbatim from the create request and never re-derived —
so it is a reliable client-side filter key. (Verified via backend `FindAllSharesByOwnerUseCase`,
`ShareRepositoryImpl`, `SaveShareUseCase`, `ShareController`.)

Additionally, `ShareService.stop()` calls **`POST /wallets/{walletId}/shares/{shareId}/stop`** —
also nonexistent. Only `revert` exists. The "Encerrar deste mês em diante" button on the
`/share` page was therefore always broken (dead code).

## Design

Frontend switches to the real `GET /shares` endpoint and filters by wallet client-side.

### 1. `ShareService` (`src/app/features/share/services/share.service.ts`)

- Replace `loadByWalletId(walletId: string | null)` with **`loadAll()`** that does
  `GET ${apiUrl}/shares` and replaces `sharesSubject` with the response. Remove the
  `walletsUrl`/wallet-path usage for shares and the inaccurate "scoped to the wallet's
  effective month" comment.
- `shares$` now holds the full owner share list (ACTIVE + REVERTED). Consumers filter as needed.
- Keep `create()` (POST `/shares`) and its optimistic prepend into `sharesSubject` — now
  consistent because reloads hit the correct endpoint.
- Keep `revert()` (POST `/shares/{id}/revert`).
- **Delete `stop()`**, plus `stoppingSubject` and the `stopping$` stream — the endpoint never
  existed.
- `reloadCurrentWallet()` (used after revert) becomes `reload()` calling `loadAll()`; drop the
  stored `currentWalletId` field since the list is owner-scoped, not wallet-scoped.

### 2. `SharePage` (`share-page.ts` / `.html`)

- Constructor effect calls `shareService.loadAll()` (no walletId argument). It still depends on
  `selectedWallet()` only to drive the other per-wallet loads (expenses, installments, payers)
  and to recompute the client-side filter.
- `shareItems` filters `shares()` to the selected wallet client-side:
  `share.walletId === this.selectedWallet()?.id`. (Previously it trusted the endpoint to scope;
  now it scopes locally.)
- `sourceOptions` (EXPENSE case) already excludes expenses with an ACTIVE share by scanning
  `shares()`; this now works because `shares$` is populated. No logic change needed there beyond
  it reading the now-correct data — but its `activelySharedExpenseIds` scan should also be
  wallet-agnostic on `sourceId` (sourceId is globally unique, so no wallet filter needed on the
  exclusion set).
- Remove the dead "stop" path: `stopShare()`, `stoppingId`, `isStoppable()`, the `stoppable`
  field on `ShareListItem`, and the "Encerrar deste mês em diante" button in the template. Keep
  the read-only `stoppedFromMonth` display (harmless; backend may still set it).

### 3. `ExpensePage` (`expense-page.ts`)

- Constructor effect and `openShareDialog`'s `afterClosed` handler call `shareService.loadAll()`
  instead of `loadByWalletId(id)`.
- `hasShare` / `shareSummary` / `activeShares` derivation in `expenseItems` is unchanged (filters
  `shares()` by `sourceType === 'EXPENSE' && sourceId === expense.id && status === 'ACTIVE'`). It
  now produces correct results because `shares$` is populated — auto-fixing Bug B (button hidden
  via the existing `@if (!expense.hasShare)` guard).

### Data flow after fix

```
POST /shares (create)  ─┐
                        ├─► sharesSubject (optimistic prepend)
GET  /shares (loadAll) ─┘        │
                                 ▼
                        shares$ (all owner shares)
                          │                      │
            SharePage: filter by walletId    ExpensePage: filter by sourceId+ACTIVE
            → list + dropdown exclusion       → hasShare badge + hide split button
```

## Edge cases

- **Owner with shares across multiple wallets:** `GET /shares` returns all; SharePage shows only
  the selected wallet's (client filter). ExpensePage matches by `sourceId`, which is unique, so
  cross-wallet shares can't false-positive a badge.
- **REVERTED shares:** included in `shares$`. SharePage already distinguishes ACTIVE vs REVERTED
  (`activeShareCount`/`revertedShareCount`). The dropdown exclusion and ExpensePage badge filter
  on `status === 'ACTIVE'`, so reverted shares correctly free the source again.
- **Optimistic entry vs reload race:** no longer harmful — both write the same shape; the
  authoritative `GET /shares` after create includes the new share (backend has no month/wallet
  scoping that could exclude it).

## Testing

- `share.service.spec.ts`: update expected URL to `/api/shares` for the load; assert `loadAll`
  populates `shares$`; remove `stop()` tests; keep `create`/`revert` tests.
- `interactive-share-dialog.component.spec.ts`: unchanged (it only exercises `create`).
- Manual/E2E: create a share via the wizard → it appears in `/share` list for that wallet; the
  expense's split button disappears and the badge shows; the `/share` dropdown no longer lists
  that expense; revert frees it again.
- Gate: `npx tsc --noEmit -p tsconfig.json` clean; `npm test -- --no-watch` all green.

## Out of scope

- No backend changes (no new `GET /wallets/{id}/shares`, no `/stop` endpoint).
- No change to share creation semantics, payment side effects, or payer rules.
