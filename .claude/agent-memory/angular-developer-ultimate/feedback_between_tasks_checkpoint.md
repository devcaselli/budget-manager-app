---
name: feedback-between-tasks-checkpoint
description: Required checkpoint sequence after finishing each task in a multi-task todo-list, before starting the next task
metadata:
  type: feedback
---

After finishing a task from a todo-list (tests green), run this sequence BEFORE moving to the next task — do not batch it up and do it once at the very end of the whole todo-list:

1. **Commit** the task's changes (only that task's files, proper conventional-commit message).
2. **Document in Obsidian** via the applicable skill (obsidian-dev-wiki / obsidian-tech-wiki / obsidian-tech-reporter / obsidian-tech-debt) per Action 6's own rule.
3. **Check need for `/compact`** — invoke the `auto-compactor` skill to decide if context is bloated enough to warrant it (long session, same files re-read many times).
4. **Ask the user** whether to proceed to the next task in the list (if any remain). Do not auto-continue.

**Why:** User (Victor) explicitly corrected this on 2026-07-22 for the sibling agent java-developer-ultimate — it had finished Task 1 of a 4-task backend todo-list (Tags Fase 2 on budget-manager-api-public) and moved straight into Task 2's investigation without commit/doc/compact-check/ask. He wants this same discipline applied here too: each task closed out fully before the next one starts, not a single wrap-up at the end.

**How to apply:** This applies per-task within ANY todo-list-driven session (the Action 3 implementation loop), not just at the very end (the code-review-checkpoint offer is separate and still happens once, after all tasks/or when the user calls it done). The commit+doc+compact-check+ask cycle repeats after every individual task. If a task uncovers a real design gap requiring another agent (e.g. angular-frontend-expert or a backend counterpart) before the NEXT task can start, that consult can happen before asking the user to proceed — but the commit/doc/compact-check for the task JUST finished must happen first regardless.
