---
name: installment-two-creation-paths
description: Two distinct installment-creation paths in api-public and their load-bearing difference (source-Expense linkage)
metadata:
  type: reference
---

`budget-manager-api-public` has TWO ways to create an Installment; they are NOT interchangeable:

1. **`InstallmentExpenseSaver.save(wallet, ExpenseInput)`** (application/expense/usecase) — the web/UI path. Saves a source `Expense` (installment=true), calls `InstallmentFactory.fromExpense(...)` to derive the Installment (splits `expense.getCost()` by N using `Money.SCALE`/`Money.ROUNDING`), saves it, then creates a CHILD Expense linked via `savedInstallment.getId()`. Result: source Expense + Installment + child Expense, all linked in the ledger. Needs a `Wallet` (uses `wallet.getEffectiveMonth()`) and an `ExpenseInput`.

2. **`SaveStandaloneInstallmentUseCase`** (application/installment/usecase) — accepts EITHER `originalValue` (splits to per-installment) OR `installmentValue` (multiplies to original), exactly one. Creates `Installment.create(...)` with `sourceExpenseId = null` and NO child Expense. Takes `sourceEffectiveMonth` directly (not from a wallet), resolves `creditCardId` via `FindCreditCardByIdBoundary`.

**Load-bearing difference:** path 1 produces a source+child Expense pair tied to the ledger; path 2 produces a bare Installment with no Expense linkage. `InstallmentFactory.fromExpense` REQUIRES an already-saved `Expense` (reads its id/cost/wallet/purchaseDate/owner) — it cannot take a `PendingExpense`.

**How to apply (for ingest staging confirm):** to get ledger-linked installments matching today's UI behavior, reuse path 1 — build the source Expense first from staged data, then feed it to `InstallmentFactory.fromExpense`; no split logic duplication. But `InstallmentExpenseSaver` currently takes a `Wallet` + `ExpenseInput` from a web request scope, so ingest confirm must assemble those inputs (creditCardId resolved separately, sourceEffectiveMonth from wallet) rather than call it as-is. See [[ingest-sync-staging]].
