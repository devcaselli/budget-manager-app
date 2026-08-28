---
name: sync-automatic-triggers
description: Where ingest-sync gets triggered automatically (cron) vs manually, and which path still creates Expense directly
metadata:
  type: reference
---

Ingest-sync tem UM gatilho automático (cron) além do botão manual. Ambos, pós-migração Enhanced Ingest, são staging-only.

**Cron:** `IngestSyncScheduler` (infra, pacote `...sync`), `@Scheduled(cron = "${app.sync.ingest.cron.expression:0 */15 22-23 * * *}", zone="America/Sao_Paulo")`. A cada 15 min, janela 22:00–23:50 BRT. Condicional `app.sync.ingest.cron.enabled` (matchIfMissing=true → ON por padrão). Habilitado por `SchedulingConfiguration` (`@EnableScheduling`).

**Cadeia do cron:** IngestSyncScheduler → SyncAllOwnersBoundary (=`SyncIngestForAllOwnersUseCase`, fan-out por owner com syncEnabled=true) → SyncIngestBoundary (=`SyncIngestForOwnerUseCase`, migrado, staging-only). Wiring em `SyncBeanConfiguration`. Mesma boundary que o botão manual `POST /sync/ingest` (SyncController). Nenhum Expense criado — só upsert em PendingExpenseReview. Não há bean legado nem 2a impl de SyncIngestBoundary. Ver [[api-public-vertical-slice]].

**Único caminho que ainda cria Expense direto (sem staging):** `MaterializePluggyTransactionsUseCase` (`Expense.create` + save). É fluxo Pluggy SEPARADO do ingest-sync, e é MANUAL: único caller é `PluggyConnectController` `POST /pluggy/items/{itemId}/materialize` (AuthenticatedUser). Sem scheduler nenhum.

**Why:** Victor (via omega-planner) investigou 2026-07 se sync automático poderia criar Expense burlando o staging. Resposta: não — o cron já é 100% staging. O único Expense-direto é o Pluggy manual.

**How to apply:** Se a decisão de produto for "nada materializa Expense sem confirmação manual", o resquício a discutir é o materialize do Pluggy (intencional/manual), não o cron. Verificar existência via grep de `@Scheduled` / `MaterializePluggyTransactionsBoundary` antes de recomendar — pode ter mudado.
