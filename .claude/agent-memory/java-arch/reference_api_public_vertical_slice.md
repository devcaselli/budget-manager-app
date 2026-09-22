---
name: api-public-vertical-slice-pattern
description: Hexagonal vertical-slice conventions in budget-manager-api-public (domain port + persistence adapter + transactional decorator)
metadata:
  type: reference
---

`budget-manager-api-public` is a 3-module Maven hexagonal project: `domain/`, `application/`, `infra/`. A vertical slice (e.g. Expense, Installment) follows a fixed shape:

- **domain**: entity/VO + a port interface `XxxRepository` (e.g. `domain/.../expense/ExpenseRepository.java`). Ports are intentionally minimal — comment says "New operations must be added together with the use case that consumes them, not speculatively." Reads return `Optional`, never throw not-found. Scoped variants via `default` methods filtering on `ownerId`.
- **application**: use cases implement a boundary interface; constructor-injected deps with `Objects.requireNonNull`. `Clock` injected for time. Output assemblers (`XxxOutputAssembler`).
- **infra/persistence/xxx/**: `XxxMongoRepository` (Spring Data interface) + `XxxRepositoryImpl` (adapter implementing the domain port) + `XxxDocument` + `mappers/XxxPersistenceMapper`.
- **infra/configs/**: `XxxBeanConfiguration` wires beans manually (not component-scan on use cases).
- **infra/configs/transactional/**: `TransactionalXxxBoundary` decorators wrap a use case and add `@Transactional` at the boundary (avoids self-invocation pitfall). E.g. `TransactionalSaveExpenseBoundary` delegates to the plain use case.
- **infra/rest/xxx/**: controller + `dtos/` (incl. `XxxPatchRequestDto` — a Patch/partial-update DTO pattern already exists for Expense & Installment) + `mappers/XxxRestMapper`.

Mongo, no joins. Adding a new small slice (like a `PendingExpenseReview`) fits this pattern without violating conventions. See [[ingest-sync-staging]].
