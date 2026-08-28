---
name: share-full-assignment-hides-expense
description: A full-assignment expense share (ownerShare=0) sets Expense.hidden=true, removing it from both the expenses screen and tag accumulation — same root cause
metadata:
  type: reference
---

Splitting an Expense via `SaveShareUseCase` where the owner keeps nothing (`ownerShare == 0`, i.e. `Share.isFullAssignment()` → `ownerRatio == 0`) marks the source `Expense.hidden = true` in-place (`SaveShareUseCase.java`, the `if (savedShare.isFullAssignment()) expenseAccumulator.hide()` block). Nothing else about the expense changes — not walletId, ownerId, or deletion.

**Consequence — one root cause, two visible symptoms:**
- The expenses screen (`GET /expenses/wallet/{id}`, `unhidden` defaults false) filters `hidden != true`, so the expense vanishes from the list.
- `TagAccumulationUseCase.accumulateExpenses` reads `findAllByWalletId`, which also filters `hidden != true`, so the expense's value drops out of every tag total too.

Both queries gate on the same `hidden` flag in `ExpenseRepositoryImpl`. So "expense disappeared AND its tag accumulation disappeared" after a share is a **single cascade**, not two bugs.

**By design, not accidental / not a regression:** `RevertShareUseCase` calls `unhide()` symmetrically on revert, and the behavior predates the recent tag-accumulation fixes (lives in the original `stable` commit). The `hide()` is behind `isFullAssignment()` — a **partial** split (ownerShare > 0) does NOT hide; it stays visible and both the screen and tag accumulation show the owner's ratio-adjusted portion (owner-ratio applied via `SubscriptionWalletBalanceCalculator.applyOwnerRatio`).

**Why it surprises users:** frontend `InteractiveShareDialogComponent` computes `ownerShare = max(cost - amount, 0)` and allows a single quota up to the full cost — so "assign the whole expense to one other payer" silently produces ownerShare=0 → full assignment → the expense disappears with no warning. See [[api-public-vertical-slice-pattern]].
