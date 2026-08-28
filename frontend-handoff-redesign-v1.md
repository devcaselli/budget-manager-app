# Frontend Handoff — Redesign v1 (Expenses + Shell + Theme)

Status: planned, not dispatched. Author: omega-planner (architecture by angular-arch). Date: 2026-08-24.

## Objective

Frontend-only visual redesign of: Expenses screen + subscreens, top menu (topbar), side menu (sidebar), dark theme, light theme. No backend/API contract changes.

## Scope

### In scope (v1, this epic)
- Theme token foundation (light + dark), Material Design token alignment, Tailwind removal
- Sidebar (grouped nav, animated active rail, collapse/persist)
- Topbar (wallet popover, theme toggle)
- Expenses page: stat cards, toolbar (search, status tabs, layout tabs, filter chips), ledger + grouped-by-day layouts
- Expense-related modals (desktop dialog variant only — `new`, `details`, `pay`, `tags`, `split`, `delete`, `imports`, `filters`)
- Accessibility/contrast pass (desktop scope)

### Explicitly out of scope
- **Mobile responsive work (deferred to v1.1)**: breakpoint restructuring at 1060px, sidebar→drawer, dialog→bottom-sheet, table→feed, new bottom tab bar. Do not build mobile variants in this epic — desktop only.
- The other 16 non-Expenses features (dashboard, wallet, payment, credit-card, tag, subscription, installment, etc.) — they inherit the new tokens automatically via D1, but no dedicated visual QA/regression pass on them is in this epic. Separate future epic.
- `expense-page.ts` refactor (12 injected services, 596 lines) — pre-existing architectural debt, unrelated to visual redesign. Logged as tech debt, not fixed here.
- Any backend/API contract change.

## Source design

Claude Design MCP project: `https://claude.ai/design/p/63e211c9-a249-4ab8-935d-1689ee29878d?file=Budget+Redesign.dc.html`. Primary file `Budget Redesign.dc.html` (fully read by angular-arch), companion `support.js` is the generic Design Components runtime (not product logic — all product interaction logic lives inline in the `.dc.html`'s `<script type="text/x-dc">` block).

The design project's own `github.md` file already maps design screens → repo file paths (repo: `devcaselli/budget-manager-app`), which was cross-validated against the actual filesystem — all paths exist.

## Chosen stack / rationale

No new stack. Redesign implemented within existing Angular 21.2.10 standalone + Angular Material 21.2.8 + CDK 21.2.8 stack. **Tailwind 4.2.4 is removed** (T1 decision — see below).

**Token source of truth: CSS custom properties (`--ew-*`) in `src/styles.scss`.** Rationale: 51/62 templates already use this hand-rolled `ew-*` SCSS design system; Tailwind is used in exactly 1/62 templates with no `@theme` block (fully disconnected from `--ew-*`); the design itself ships as raw CSS custom properties with zero utility classes. Adopting tokens costs zero translation; adopting Tailwind would require reverse-engineering the design's tokens into a `@theme` block and reconverting 51 templates.

## Key architectural finding (corrects the original brief)

The brief described "dark theme redesigned, light theme same essence applied differently." **This is inverted.** Numeric comparison of design tokens vs. repo's existing light tokens: **5/5 colors identical** (`#f5efe6`, `#fffaf2`, `#ded0be`, `#1f1a15`, `#a86935`) — light is a no-op. The **dark** theme is the one that changes, and substantially: amber-on-brown (`#13110e` / `#d6a371`) → teal-on-petrol (`#0F1A1E` / `#6FB3C4`), roughly a 35°→193° hue shift on the accent. Treat dark as a new theme, not a tweak.

## Confirmed decisions (all ratified by Victor, 2026-08-24)

| # | Decision | Answer |
|---|---|---|
| 1 | Scope: this epic vs. all 17 features | **This epic = foundation + shell + Expenses only.** Other 16 features get tokens for free, visual QA is a separate future epic. |
| 2 | Tailwind | **Remove (T1)** — D3 converts `share-form` (only user) to `ew-*`, deletes `tailwind.css` + `angular.json` entry. |
| 3 | `expense-page.ts` 12-service god-component | **Defer as tech debt.** Do not refactor as part of D6. Needs an `obsidian-tech-debt` entry (not yet written). |
| 4 | Bundle P1/P2/P3 fixes into D1? | **Yes.** See "Fixes bundled into D1" below. |
| 5 | Default theme with no localStorage + no OS preference | **Light** (matches design; changes current repo behavior, which falls back to dark). |
| 6 | "Inbox" nav item in design | **Confirmed** = `/review-imports` (`features/pending-review/`). |
| 7 | Mobile (D7/D8) | **Deferred to v1.1.** Not in this epic. |

### Fixes bundled into D1 (theme foundation task)
- **P1 — privacyMode not persisted.** `core/services/preferences.service.ts:33` reads `signal(bodyHasClass('ew-privacy'))` instead of localStorage like every other preference (`bm_theme`, `bm_layout`, `bm_tweaks`, `bm_flags`). Real privacy bug: toggling privacy mode does not survive refresh. Fix: `signal(readStored('bm_privacy') === 'on')` + write on toggle + apply class on boot.
- **P2 — theme boot logic misplaced.** `layout/shell/shell.component.ts:190-194` applies `document.body.classList.add('ew-light')` in the Shell constructor instead of the `PreferencesService`. No `prefers-color-scheme` fallback (design has one). Fix: move boot to the service (or an `APP_INITIALIZER`) with `readStored('bm_theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')`.
- **P3 — theme contract polarity flip.** Repo: dark is the `:root` default, light is opt-in via `body.ew-light`. Design: light is the `:root` default, dark is opt-in via `[data-theme="dark"]` on `<html>`. **Adopt the design's contract** (`[data-theme]` on `<html>`, light in `:root`) — matches the `color-scheme` platform standard and lets the design's CSS be ported almost verbatim.

## Architectural constraints

- **No `[style]` string-concatenated bindings.** The design applies dozens of computed inline styles per row (`rowStyle`, `amountStyle`, `dotStyle`, `payBtnStyle`...). Translating those literally into Angular `[style]` bindings re-evaluates on every CD cycle. Must become static CSS classes + tokens; use `computed()` only where a derived value is unavoidable.
- **`OnPush` change detection** on every new/touched component.
- **`@for` with `track` by `id`** everywhere.
- **Do not reintroduce O(n·m) lookups.** `expense-page.ts` lines 193-234 already converted card/bullet/payment/share lookups to `Map`-based O(1) — grouping-by-day work in D6 must preserve this, not add `.find()` inside `.map()`.
- **Component style budget**: `angular.json`'s `anyComponentStyle` budget is **8kB warning / 20kB error** (not 20kB warning as an earlier draft of this doc said). `shell.component.scss` already exceeds the 8kB warning threshold (~12.7KB as of D5) and stays a warning, not a build failure. D4/D5 grew this file; D6 also pushed `expense-page.scss` over 8kB (**10.49kB** after extracting `.ew-sr-only` / `.ep-tabs-thumb` to global `styles.scss` — the two reusable primitives; the rest is genuinely page-specific: stat cards, import banner, toolbar/chips, day-groups). Still a warning, not a build failure (error threshold is 20kB). Getting fully under 8kB would need splitting the component itself (e.g. a `<expense-day-groups>` child) — deferred as tech debt rather than done reactively here, since D9 (desktop modals) and D10 (a11y pass) will touch this file again soon and may reshape it anyway.
- **Material token alignment (D2)**: `mat.theme()` currently uses `$azure-palette` + Roboto typography, disconnected from the `--ew-*` copper/Inter Tight system. 59 `MatDialogModule` instances and 36 `MatButtonModule` instances will render with mismatched theme unless D2 overrides `--mat-*` design tokens to `var(--ew-*)`.

## Dependencies / integration points

- No backend/API changes — confirmed pure frontend, `expense-list.filters.ts` and existing models cover all semantics the design requires (reused unmodified in D6).
- `expense-list.filters.ts` is genuinely solid (pure, generic `<T extends FilterableExpense>`, immutable, tested) — reuse as-is, do not touch.

## Acceptance criteria (epic-level)

- Toggling theme leaves no surface showing the old theme's colors.
- Refresh preserves theme and privacy-mode state.
- No `body.ew-light` remnants; `[data-theme]` contract fully adopted.
- No Tailwind utility classes remain in the app; bundle size does not regress.
- All 59 Material dialogs and 36 buttons render with `--ew-*`-aligned surface/typography in both themes.
- Sidebar active-item rail animates correctly; badge shows on Inbox (`/review-imports`); collapsed state persists.
- Expenses filter/sort/grouping correct at 0, 1, and 500+ items; no `[style]` string concatenation introduced.
- Existing specs (`expense-page.ts` has a 589-line spec) pass with no regressions.
- WCAG AA contrast (4.5:1 text, 3:1 UI) verified on **both** palettes — dark palette was never validated pre-redesign, treat as unverified until D10.

## Task breakdown — dispatch order

Each task = one `angular-developer-ultimate` run with a checkpoint before the next. Do not batch.

1. **D1 — Theme token foundation** *(blocks everything)*. Files: `src/styles.scss`, `core/services/preferences.service.ts`, `layout/shell/shell.component.ts`. Port ~40 semantic tokens both themes (light unchanged, dark replaced with teal/petrol palette); adopt `[data-theme]` contract; move theme boot to service with OS-preference fallback defaulting light; fix privacyMode persistence.
2. **D2 — Material token alignment** *(dep: D1)*. File: `src/styles.scss`. `mat.theme()` primary from copper + Inter Tight typography; override dialog/button/icon `--mat-*` tokens to `var(--ew-*)`.
3. **D3 — Tailwind removal** *(dep: D1)*. Files: `angular.json`, `src/tailwind.css`, `features/share/components/share-form/share-form.component.html`. Convert the one template to `ew-*`, delete Tailwind entry point and `styles` array entry.
4. **D4 — Sidebar** *(dep: D1)*. File: `layout/shell/shell.component.{html,ts,scss}`. Regroup nav to BUDGET/LEDGER/MANAGER/EXTERNAL; collapsible groups persisted to localStorage; animated active rail; Inbox pending badge; desktop collapse to 0px. **No drawer** (that's v1.1/D7).
5. **D5 — Topbar + wallet popover** *(dep: D1, parallel to D4)*. Same files as D4. Sticky 68px topbar with backdrop-filter; desktop wallet popover; theme toggle.
6. **D6 — Expenses page** *(dep: D1, D4, D5 — largest task)*. Files: `features/expense/pages/expense-page/{expense-page.ts,.html,.scss}`. Reuse `expense-list.filters.ts` unmodified. Title + stat cards + import banner; toolbar (search, sliding status tabs, layout tabs, removable filter chips); ledger + grouped-by-day layouts with sticky day headers and subtotals. Apply the "no `[style]` concatenation" rule strictly.
7. **D9 — Modals, desktop only** *(dep: D2, D6)*. Files: the 4 expense dialogs + `features/pending-review/`. 544px centered dialog for all 8 modal types (`new`, `details`, `pay`, `tags`, `split` 3-step, `delete`, `imports`, `filters`). Skip the mobile bottom-sheet variant — v1.1.
8. **D10 — Accessibility/contrast pass, desktop scope** *(dep: D6, D9)*. WCAG AA on both palettes (dark unverified — priority focus); keyboard focus order; `aria-current` on nav; toast announcements; `prefers-reduced-motion` on rail/thumb transitions.

**Deferred to v1.1 (do not dispatch under this epic):** D7 (shell mobile — drawer + bottom tab bar, 1060px breakpoint), D8 (Expenses mobile grouped feed).

## Open items / follow-ups (not blocking, track separately)

- Write `obsidian-tech-debt` entry for `expense-page.ts` (12 services/596 lines) — natural moment to revisit is whenever D6 or its successor touches that file next.
- `support.js` (69KB, Design Components framework runtime) was not read line-by-line — if unexpected interaction behavior surfaces during D6/D9 implementation, it's the fallback reference; all product-level interaction logic was already extracted from the `.dc.html`'s inline script block.
- Design mocks only 7 expenses — no explicit design guidance for truncation/wrap at scale (long names, many tags, 6-digit monetary values in mono font). Implementation judgment call in D6.

## Recent fixes (post-D5)

### Sidebar element width alignment (2026-08-26)
Fixed width misalignment between `.ew-wallet-btn` (wallet quick-view button) and `.ew-user-chip` (user avatar + info section) in the sidebar footer. Both elements had the same `width: 100%` but asymmetric padding, causing the wallet button to appear ~20px wider than the user chip when rendered side-by-side.

**Changes:**
- `.ew-wallet-wrap`: added `width: 100%` to explicitly constrain the wrapper
- `.ew-wallet-btn`: reduced horizontal padding from `11px 13px` to `11px 11px` for consistent right edge
- `.ew-user-chip`: standardized padding from `8px 4px 8px 11px` to `8px 11px` (symmetric), added `width: 100%` and `box-sizing: border-box`

Result: both elements now share identical padding geometry (11px left/right) and are properly aligned as visual columns within the 258px sidebar. Tests pass, lint passes, build succeeds (12.7kB shell component — warning threshold, not error).

## Reviewer note

Every task above gets `angular-developer-ultimate`'s standard review offer (self-review, fresh Opus session with angular-frontend-expert, or explained-risk skip) before being marked done — per Victor's standing process, see agent memory `feedback_review_gate`.
