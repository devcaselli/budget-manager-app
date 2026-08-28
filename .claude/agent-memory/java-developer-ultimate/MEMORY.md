## Index

- [User: Victor's role and workflow](user_victor_role.md) — solo dev on personal finance app suite, uses java-arch/omega-planner upstream, delegates execution to this agent.
- [Project: budget-manager ecosystem](project_budget_manager_ecosystem.md) — repo layout, hexagonal hosting, Obsidian-driven planning workflow.
- [Feedback: rtk rewrites bash commands silently](feedback_rtk_find_shadow.md) — `find` needs `/usr/bin/find` for compound predicates; `git diff` can be silently truncated, use `rtk proxy git diff` and cross-check `--stat` counts.
- [Feedback: self-review value confirmed](feedback_self_review_value.md) — Victor picked Sonnet self-review over Opus for a real feature close-out; it caught real MAJOR bugs — run it with full rigor, not as a formality.
- [Project: budget-manager MapStruct unmappedSourcePolicy=ERROR](project_budget_manager_mapstruct_unmapped_source_policy.md) — new domain getters break infra compile even when persistence is out of scope; fix via method-level `@BeanMapping` override, not `@Mapping(source=..., ignore=true)`.
