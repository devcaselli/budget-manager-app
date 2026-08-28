---
name: project-budget-manager-mapstruct-unmapped-source-policy
description: budget-manager-api-public's ProjectMapper sets unmappedSourcePolicy=ERROR globally — adding any new getter to a MapStruct-mapped domain aggregate breaks infra compilation even if the mapper file isn't intentionally touched
metadata:
  type: project
---

`budget-manager-api-public`'s shared MapStruct config (`infra/.../configs/mapstruct/ProjectMapper.java`) sets both `unmappedTargetPolicy=ERROR` and `unmappedSourcePolicy=ERROR`. The `unmappedSourcePolicy=ERROR` half is easy to forget because it fires on the *source* type, not the mapper you're editing.

**Why this matters:** adding a new field/getter to a domain aggregate (e.g. `Expense`, `Subscription`) that has a `@Mapper(config = ProjectMapper.class)` interface mapping it to a persistence `*Document` will break `infra` module compilation — MapStruct sees the new getter with no corresponding mapped property on the target document and errors at annotation-processing time. This happens even when the persistence layer is explicitly out of scope for the task (e.g. task A1/A3 of the omega-viewer feature, domain-only additive field changes deferred persistence wiring to task A5).

**How to apply:**
- When a domain-only field addition breaks `infra` compilation with `annotation @org.mapstruct.Mapping is missing a default value for the element 'target'` or similar, the fix is `@BeanMapping(unmappedSourcePolicy = ReportingPolicy.IGNORE)` at the **method** level on the affected `toDocument(...)` method(s) — not `@Mapping(source = "...", ignore = true)` (invalid — MapStruct requires `target` on `@Mapping`, ignoring an unmapped *source* property needs the `@BeanMapping` policy override instead).
- Scope the `@BeanMapping` override narrowly (only the specific `toDocument` overloads affected) and leave a comment tying it to the deferred persistence task, so it's obvious the relaxation is temporary and not a blanket opt-out.
- This will very likely recur for task A4 (`Installment` audit fields) and any other Fase A/future field-addition task in this codebase before the corresponding persistence task (A5-equivalent) lands. Expect it, don't be surprised by the cascade of infra compile errors.
- Existing round-trip persistence-mapper tests (`usingRecursiveComparison().isEqualTo(original)`) will also break the same way — new domain fields not yet persisted are legitimately lost on a document round-trip. Fix with `.ignoringFields("theNewField", ...)` and a comment, not by weakening the domain change.

See [[feedback-rtk-find-shadow]] for a related lesson: the resulting cascade of "unrelated" compile errors across other persistence documents can look like a stale-build/rtk artifact — it isn't; it's the same root MapStruct error surfacing confusingly under incremental/`-rf` rebuilds. Isolate with `git stash` + `mvn clean` before suspecting tooling.
