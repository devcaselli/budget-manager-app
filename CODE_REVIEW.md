# Code Review — budget-manager-app

> **Update 2026-06-16**: All Major and Minor findings below have been addressed on branch
> `fix/code-review-2026-06-16`. High-value tests added (auth service/guard/interceptors,
> pipes, currency util, LoadingCounter, dashboard calc, expense filter/sort, credit-card &
> payer services). Suite: **130 passing**. Correction: the test runner is **Vitest**
> (`@angular/build:unit-test`), not Jest. Remaining lint errors are pre-existing template
> accessibility issues, out of this review's scope.


Reviewed: full application (Angular 21, standalone, signals).
Scope: `src/app/**` — core (auth, interceptors, config), 13 feature modules, shared pipes/UI, layout shell.
Tooling checked: `tsc -p tsconfig.app.json --noEmit` → **clean**. `strict: true` + `strictTemplates: true`. No `any`, no `console.*` in `src/app`.

## Summary

- **What it delivers**: Personal budget manager — wallets, bullets, expenses, installments, subscriptions, payments, shares, dashboard with SVG charts/heatmap. JWT auth against a REST backend (`/api`).
- **How it's built**: Standalone components, OnPush everywhere, signals + `toSignal` for view state. Per-feature singleton services own state via `BehaviorSubject` (documented shared-state pattern). Lazy-loaded routes behind a shell + functional `authGuard`. Two HTTP interceptors: bearer/refresh + retry-on-network-error. Reactive single-flight token refresh.

The architecture is consistent and modern. Main weaknesses are **test breadth** (zero page/dialog/component tests, ~half the services untested) and a few **security/correctness** points around token handling and the export download.

---

## Critical — block merge

No critical issues.

---

## Major — should fix

- **[MAJOR — Tests]** entire `features/*/pages/**` and `features/*/components/**dialog**`
  - Problem: **0 page specs, 0 dialog specs** out of 12 pages + 14 dialogs. The heaviest logic in the app — `dashboard-page.ts` (~590 lines: chart math, heatmap grid, subscription-version resolution), `expense-page.ts` (filter/sort pipeline), `share-page.ts` (3 form-mutating effects), `installment-page.ts` — has **no test at all**. Services `credit-card`, `installment`, `payer` also lack specs.
  - Fix: add component specs for the four heavy pages (filter/sort, chart point/heatmap-cell builders, the `effect()` form-sync branches) and service specs for the three untested services. Extract pure chart/heatmap helpers (see suggestion below) so they unit-test without `TestBed`.
  - Why it matters: this is financial math (committed/remaining/utilization, installment cycles, subscription amounts). A regression here is silently wrong money, and nothing would catch it.

- **[MAJOR — Security]** `core/auth/auth.service.ts:43` (`writeSession` → `localStorage`)
  - Problem: access **and** refresh tokens are stored in `localStorage`, readable by any XSS-injected script; the refresh token gives long-lived account access.
  - Fix: for a prototype this is a known tradeoff (see memory), but document it explicitly and plan migration to `httpOnly` cookies for the refresh token (or at minimum sessionStorage + short refresh TTL) before any real deployment. Add a regression test asserting tokens are cleared on `logout()` / expiry.
  - Why it matters: token theft = full account takeover. The `prod` environment already points at a real domain (`environment.prod.ts:3`).

- **[MAJOR — Correctness]** `core/auth/auth.service.ts:52` `getTokenExp` / `isTokenExpired`
  - Problem: expiry is decided **client-side** by trusting the JWT `exp` with no clock-skew margin and no signature check. `hasValidSession()` (used by `authGuard`) gates routing purely on this. A token valid by 1s passes the guard, then the first request 401s.
  - Fix: add a small skew buffer (e.g. treat as expired `exp - 30s`), and rely on the interceptor's refresh flow as the real authority rather than the guard's local check.
  - Why it matters: edge-of-expiry navigations land the user on a broken page instead of refreshing or redirecting cleanly.

- **[MAJOR — Correctness]** `features/dashboard/pages/dashboard-page.ts:475` `headlineText`
  - Problem: `(wallet.budget - wallet.remaining) / wallet.budget` with no guard for `budget === 0` → `NaN`/`Infinity` → `Math.round(NaN)` = `NaN`, all `pct < x` comparisons false, returns `'Almost there'` for an empty wallet. `utilizationPct` (line 417) and `subsSharePct` (line 238) correctly guard `<= 0`; this one doesn't.
  - Fix: guard `wallet.budget <= 0` and return a neutral headline.

---

## Minor & suggestions

- **[MINOR — Correctness]** `features/dashboard/pages/dashboard-page.ts:328` `downloadExport`
  - The `exportMine()` subscription has no `takeUntilDestroyed` and no error handler — if the user navigates away mid-download or the request fails, it throws unhandled. Pipe `takeUntilDestroyed(this.destroyRef)` and add an `error` callback. (Every other component subscription in the app is correctly managed — this is the one exception.)

- **[MINOR — Dead code]** `features/dashboard/pages/dashboard-page.ts:559` `isSubscriptionInMonth`
  - Private method is never called (`isSubscriptionActiveInMonth` is used instead). Remove it.

- **[MINOR — Consistency]** error strings across services (`wallet.service.ts:56`, `expense.service.ts:64`, etc.)
  - User-facing messages lack accents ("Nao foi possivel...") while auth messages are correct ("Servidor indisponível"). Normalize — these are shown to users.

- **[MINOR — Readability]** `layout/shell/shell.component.ts:10`
  - Two `interface` declarations (`PopoverCoords`, `TweaksPos`) sit between import statements. Move them below the import block.

- **[MINOR — Duplication]** loading-counter logic
  - `startLoading`/`stopLoading` + `activeLoadingRequests` is copy-pasted verbatim in `wallet`, `expense`, `payment`, `subscription` (and likely the rest). Extract a small `LoadingCounter` helper or base class.

- **[MINOR — Duplication]** BRL formatting
  - `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` is re-instantiated inline in `expense-page.ts:223`, `shell.component.ts:222`, `dashboard-page.ts:587` despite `BrlCurrencyPipe` already wrapping a shared formatter. Reuse a shared `formatBrl()` util (the pipe's `formatter`) instead of allocating new `Intl` instances on each call.

- **[SUGGESTION]** Extract dashboard chart/heatmap math into pure functions
  - `spendingPoints`, `subsWalletPoints`, `heatmapCells`, `lastNMonths`, `subscriptionAmountForMonth` are pure transforms buried in the component. Move to a `dashboard.charts.ts` of pure functions: directly unit-testable, shrinks the component, and removes the `TestBed` barrier blocking the missing tests.

- **[SUGGESTION]** `features/share/pages/share-page.ts:303-339` — three `effect()`s that `setValue` on the form
  - Functionally fine (writes use `{ emitEvent: false }` or target controls not read back, so no loop), but effect-driven form mutation is subtle. A short comment on why each is loop-safe would protect future edits.

---

## Tests

Runner: `@angular/build:unit-test` (Vitest-based, per `angular.json`). Note: this is **not** Jest — `package.json` `test` = `ng test`. Suite not executed in this review (experimental builder; raw `npx jest` is not configured here).

Spec inventory: **11 spec files for 84 source files.**

```
Services    7/13 specd     wallet, expense, payment, subscription, share, bullet, extra-budget, reserved-budget ✓
                           credit-card, installment, payer, auth ✗
Pages       0/12 specd     FAIL — all untested
Components  0/14 dialogs   FAIL — all untested
Pipes       0/2  specd     brl-currency, br-date untested
Interceptors 0/2 specd     auth, api-error untested
Guard       0/1  specd     authGuard untested
```

Quality of existing specs (e.g. `wallet.service.spec.ts`): **good** — AAA, `HttpTestingController`, asserts real behavior (cancellation via `switchMap`, loading transitions, error mapping, `shareReplay` single-flight). Not mock-only. Keep this bar.

Gaps (highest value first):
- `dashboard-page` chart/heatmap/subscription math — untested, pure, financial.
- `expense-page` `filteredExpenseItems` filter+sort — untested branching.
- `share-page` form-sync `effect()`s — untested, subtle.
- `auth.service` `isTokenExpired` / `refreshAccessToken` single-flight / `logout` clears storage — untested security path.
- `authGuard` redirect-on-expiry — untested.
- `auth.interceptor` 401→refresh→retry, and refresh-failure→`/login` — untested security path.
- `api-error.interceptor` retry only on status 0 — untested.
- `BrlCurrencyPipe` / `BrDatePipe` (incl. null → "Sem fechamento") — untested.

Mutation testing: not applicable (non-JVM project).

---

## Security & Performance

**Security**
- Token storage in `localStorage` (access + refresh) — XSS-exposed. See Major. The `authInterceptor` correctly skips bearer on `/auth/token|register|refresh` and the refresh flow is single-flight (`auth.service.ts:99`) — good.
- Client-side-only expiry trust with no skew margin — see Major.
- No other injection/secret-leak issues; outputs go through Angular's auto-escaping; no `innerHTML`/`bypassSecurity*` usage found.

**Performance**
- No N+1 / nested-loop-over-same-data issues. Dashboard correctly pre-builds `Map`s (`walletEffectiveMonthMap`, `totalsByMonth`, `totalsByDay`) for O(n) aggregation rather than nested scans — good.
- `expense-page.html` / `dashboard-page.html` call methods in the template (~74 call sites), but all resolve to **signals/`computed`**, which are memoized — not the classic function-in-template re-render trap. Fine under OnPush.
- `subscriptionAmountForMonth` (`dashboard-page.ts:570`) does `[...versions].sort()` per call, invoked inside the per-month `reduce` in `subsWalletPoints` → O(months × subs × versions log versions). Cold-ish path with small N; acceptable, but if version lists grow, pre-index latest-version-per-month once.

**Complexity**
- No changes with worse-than-needed Big-O.

**Observability**
- No logging/telemetry anywhere (no `console`, no error reporter). Errors are swallowed into `errorSubject` strings or `error: () => undefined`. For a prototype this is fine; before production, route caught HTTP errors to a real reporter rather than dropping them.

---

## Verdict

**REQUEST CHANGES** — architecture and type-safety are solid, but the complete absence of page/dialog/component tests over financial logic, plus the token-storage and `budget === 0` correctness gaps, should be addressed before this is treated as production-ready.
