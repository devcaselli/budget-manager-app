---
name: feedback-self-review-value
description: Victor picked self-review (Sonnet 5) over Opus/java-arch for a real feature close-out, and it caught real bugs
metadata:
  type: feedback
---

For the Enhanced Ingest backend feature close-out (2026-07-24, 7 tasks), when offered the standard 3-way code-review checkpoint (new Opus+java-arch session / self-review on Sonnet 5 / skip), Victor picked **option 2 — self-review, same session, Sonnet 5** — not the "strongest" Opus option.

**Why this matters:** the self-review wasn't a rubber stamp. It found two real MAJOR bugs (duplicate ids in a confirm-batch payload could silently double-materialize a ledger entry; a dead `{@link}` javadoc reference contradicting another doc) and one MINOR robustness gap (a derived Spring Data query that would crash instead of degrade if a best-effort index was ever missing — directly related to two index bugs already found earlier in the same session). All were fixed automatically per the agent's standard protocol, tests re-run green, and committed.

**How to apply:** don't assume Sonnet self-review is a weak formality just because Opus is offered as the "recommended" default in the checkpoint framing — for this user, on this codebase, it delivered real signal. Keep offering all three options every time (per hard boundary — never skip the checkpoint), but don't be surprised or under-invest effort when option 2 is chosen; run it with full rigor (read the *complete* diff, not a truncated one — see [[feedback_rtk_find_shadow]] for why that almost went wrong this same session).
