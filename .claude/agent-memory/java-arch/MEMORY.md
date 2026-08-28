# Agent Memory Index

- [Enhanced Ingest / staging-only sync](project_ingest_sync_staging.md) — sync becoming staging-only, needs new persisted PendingExpenseReview state
- [api-public vertical-slice pattern](reference_api_public_vertical_slice.md) — hexagonal slice shape: domain port + persistence adapter + transactional decorator
- [Two installment creation paths](reference_installment_creation_paths.md) — InstallmentExpenseSaver (ledger-linked) vs SaveStandaloneInstallmentUseCase (bare); their load-bearing difference
- [Sync automatic triggers](reference_sync_automatic_triggers.md) — cron (IngestSyncScheduler, staging-only) vs manual; only Pluggy-materialize still creates Expense direct, and it's manual-only
- [Full-assignment share hides expense](reference_share_full_assignment_hides_expense.md) — ownerShare=0 split sets Expense.hidden=true; removes it from screen AND tag accumulation (same root, by-design)
- [MongoQueryCounter anti-N+1 harness](reference_mongo_query_counter.md) — how the wire-command counter proves PaymentTraceResolver batching, verified sensitive (5 vs 9), plus its empty-set blind spot
