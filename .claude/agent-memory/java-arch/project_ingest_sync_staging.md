---
name: ingest-sync-staging
description: Enhanced Ingest feature — sync becoming staging-only with a new persisted PendingExpenseReview state in api-public
metadata:
  type: project
---

"Enhanced Ingest" reworks the ingest→expense flow in `budget-manager-api-public`. Planned by omega-planner; final decision is Victor's.

Current state (as of 2026-07): `PendingExpense` is a transient domain record (`domain/sync/PendingExpense.java`) fetched via GET from ingest-api each sync; NOT persisted here. `SyncIngestForOwnerUseCase` materializes an `Expense` immediately per pending item. Dedup = `expenseRepository.findBySourcePendingId(id, ownerId)` (Mongo partial-unique index on `(ownerId, sourcePendingId)`). No status/state exists.

Product change: sync becomes STAGING-ONLY (no immediate Expense creation). User reviews pending items in a modal — can unmark (defers to next sync), edit name, mark installment (N parcels, splits total), delete permanently, then batch-confirm to actually create Expenses/Installments. This requires a NEW persisted state in this service to survive between sync calls.

**Why:** dedup today can't represent "seen but not yet confirmed / discarded / edited" — Expense-existence is binary.
**How to apply:** any staging state needs its own persistence keyed by `sourcePendingId + ownerId`. See [[api-public-vertical-slice-pattern]] for how to add it cleanly, and [[installment-two-creation-paths]] for the installment-confirmation caveat.

**Status (2026-07-24):** handoff (`budget-manager-api-public/backend-handoff.md`) broken by java-arch into 7 backend tasks. Fine-grained plan lives in the obsidian dev-wiki: `Tech/Development/Budget Manager/enhanced-ingest/{README.md, backend-tasks.md}` (executor is java-developer-ultimate). Tasks: 1 slice, 2 sync staging-only + list/edit/discard endpoints, 3 collaborator-extract (fixes the `sourcePendingId` bug), 4 batch confirm, 5 markConsumed timing move, 6 e2e, 7 closeout. Critical path 1→2→4→(5)→6→7 with 3 parallel-before-4.

**Code-confirmed correction to the handoff bug framing:** the `sourcePendingId` bug is ONLY in the installment path. `SyncIngestForOwnerUseCase` simple-expense creation already uses the 10-arg `Expense.create(...)` overload with `pending.id()` (sets sourcePendingId fine). `InstallmentExpenseSaver` uses the SHORT overload → null. So the confirm use-case uses the long overload directly for simple expenses, and the extracted collaborator only for installments.
