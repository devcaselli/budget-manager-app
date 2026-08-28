---
name: user-victor-role
description: Victor's role and how he runs the budget-manager project ecosystem
metadata:
  type: user
---

Victor is the sole developer/owner of the budget-manager personal finance app suite (backend `budget-manager-api-public`, frontend `budget-manager-app`, plus an ingest-api sidecar). He runs a structured multi-agent workflow: `omega-planner` writes handoff docs with product context and open questions, `java-arch` breaks those into numbered task lists with STATUS tracking (TODO → DOING → CODE REVIEW → DONE) and closes out open technical decisions, and `java-developer-ultimate` (this agent) executes the task list end to end.

**Why:** keeps planning/architecture separate from execution so each agent stays in its lane — this agent should never re-litigate decisions already closed in the README/handoff docs feeding it.

**How to apply:** always look for a `backend-tasks.md`/`frontend-tasks.md` + `README.md` pair under `~/Documents/Obsidian/Tech/Development/Budget Manager/<feature>/` before starting, plus a `*-handoff.md` in the repo root for original acceptance criteria. Treat the README's "decisões já fechadas" table as immutable. Update task STATUS fields as work progresses. See [[project_budget_manager_ecosystem]].
