---
name: project-budget-manager-ecosystem
description: Repo layout and architecture conventions for the budget-manager backend
metadata:
  type: project
---

`budget-manager-api-public` is a hexagonal Maven multi-module project (`domain/`, `application/`, `infra/`) on MongoDB (no JPA/Flyway), multi-tenant by `ownerId`. Base package `br.com.casellisoftware.budgetmanager`. Companion repo `budget-manager-app` is the frontend — kept in separate work rounds, never touched in the same session as backend work unless explicitly asked.

**Why:** the split lets backend/frontend land independently; frontend handoffs live in `budget-manager-app/frontend-handoff.md` and are out of scope until a separate round.

**How to apply:**
- Slice-vertical pattern for any new aggregate: `domain/<slice>/` (entity + port) → `infra/persistence/<slice>/` (`XxxDocument` + `XxxMongoRepository` + `XxxRepositoryImpl` + `mappers/`) → `infra/configs/XxxBeanConfiguration` (manual wiring, no `@Component` scanning of use-cases) → `infra/configs/transactional/TransactionalXxxBoundary` (`@Transactional` boundary wrapper, avoids self-invocation) → `infra/rest/<slice>/` (controller + `dtos/` + MapStruct mapper).
- Partial-unique Mongo indexes (e.g. `(ownerId, sourcePendingId)`) are created programmatically in a `MongoConfiguration implements ApplicationListener<ContextRefreshedEvent>`, wrapped in try/catch that only logs a warning — never fails the boot.
- `ExpenseRepository`/similar ports are intentionally minimal — add an operation only alongside the use case that consumes it, not speculatively.
- Money: `Money.SCALE=2`, `HALF_EVEN` rounding; installment division always goes through `InstallmentFactory.fromExpense` — never reimplement the per-installment divide.
- Errors: `GlobalExceptionHandler` maps each domain exception to an RFC7807 `ProblemDetail` with a `correlationId` property; never let `IllegalArgumentException` leak as a generic 400.
- Tests: Testcontainers Mongo for persistence/e2e (`AbstractMongoIntegrationTest` base, or ad hoc `@SpringBootTest @Testcontainers` for full-stack `*EndToEndTest`), Mockito for use-case unit tests.
- Planning artifacts live in Obsidian at `~/Documents/Obsidian/Tech/Development/Budget Manager/<feature>/` (`README.md` = product context + closed decisions, `backend-tasks.md`/`frontend-tasks.md` = numbered execution tasks with STATUS). Original handoff with acceptance criteria lives in the repo root as `backend-handoff.md`.
