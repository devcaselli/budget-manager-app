---
name: feedback-rtk-find-shadow
description: rtk transparently rewrites bash commands (find, git diff, ...) and can silently truncate/reject output — verify before trusting
metadata:
  type: feedback
---

`rtk` (Rust Token Killer, global CLAUDE.md tool) transparently rewrites bash commands before they reach the shell (per its own CLAUDE.md: "All other commands are automatically rewritten by the Claude Code hook — 0 tokens overhead"). This affects more than `find`:

- **`find`**: a shell function reroutes to Claude Code's bfs-based shim, which rejects compound predicates/actions (`-not`, `-exec ... \;`) with "rtk find does not support compound predicates or actions". `command find ...` does NOT bypass it (only skips aliases/builtins, not shell functions).
- **`git diff` (and likely other `git` subcommands)**: silently rewritten to `rtk git diff`, which applies its own token-saving filtering — a `git diff --cached` that `git diff --stat` reports as 3512 insertions across 60 files came back as only 581 diff lines with zero `diff --git` markers. No error, no warning — it just returns a truncated/summarized diff that looks plausible.

**Why:** discovered empirically in `budget-manager-api-public`. The `find` issue surfaced immediately (explicit error). The `git diff` issue was far more dangerous — it would have let a code-review pass over a silently incomplete diff with no indication anything was missing, if the `--stat` line count hadn't been cross-checked first.

**How to apply:**
- For `find` needing `-not`/`-exec`/other compound syntax: invoke `/usr/bin/find` explicitly.
- For any command whose **complete, unfiltered output matters** (full diffs for code review, full logs, anything you're about to trust as ground truth) — especially `git diff`/`git show`: prefix with `rtk proxy` (e.g. `rtk proxy git diff --cached --no-color`), which RTK.md documents as the raw/unfiltered execution path ("Execute raw command without filtering — for debugging"). Cross-check line/stat counts (`git diff --stat` insertions vs. actual diff line count) before trusting output that will drive a real decision — a plausible-looking but truncated result is worse than an obvious error because nothing signals it happened.
- **`mvn` via `rtk proxy` is NOT the suspect if a multi-module build shows a confusing cascade of unrelated compile errors (Lombok getters "missing" on untouched classes, etc.).** Verified empirically on `budget-manager-api-public` (2026-07-29): a real MapStruct `@Mapping` annotation error (missing required `target` element) in one file caused what looked like an unrelated cascade across several other persistence documents when re-running with `-rf :infra`/incremental state. Confirmed with direct `/usr/bin/mvn` (bypassing rtk entirely) that the cascade was 100% reproducible from a clean `mvn clean` — it was a genuine compile error, not an rtk artifact. Lesson: when a build cascade looks implausible, isolate with a `git stash` of your own changes and rebuild from clean before suspecting the tool proxy — the proxy was innocent both times so far, but don't skip the isolation step.
