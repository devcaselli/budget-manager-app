---
name: feedback-verify-minor-developer-test-claims
description: Always re-run the full test suite independently when reviewing angular-minor-developer's work; never trust its reported pass/fail counts at face value
metadata:
  type: feedback
---

When acting as the reviewing agent in the `angular-minor-developer` (Haiku, implements) → `angular-developer-ultimate` (Sonnet 5, reviews + commits) dispatch chain, always run the full test suite yourself at least once (twice if the first run shows any discrepancy) before trusting the minor-developer's self-reported test results.

**Why:** On 2026-08-25, reviewing a post-epic fix to `budget-manager-app`'s shell topbar wallet trigger, the minor-developer reported "1022/1027 passing, 5 pre-existing timeouts" — a discrepancy against the epic's closing baseline of 1027/1027 that looked like a real regression flag. Independently running the full suite twice came back 1027/1027 both times, zero timeouts, zero flakiness. The minor-developer's report was simply inaccurate (bad run or miscount on Haiku's end), not a real regression — but it would have been easy to accept the claim and either ship a "known regression" or waste time chasing a phantom test failure.

**How to apply:** This applies specifically to the minor→ultimate review chain, where the reviewer's job is exactly to catch this class of error before commit. Don't skip re-running tests just because the minor-developer's report sounds specific/plausible ("5 pre-existing timeouts" reads as confident and detailed, but was still wrong). A single clean run isn't enough if the reported count doesn't match the known baseline — re-run again to rule out flakiness in either direction before concluding the report was wrong vs. a real intermittent issue.
