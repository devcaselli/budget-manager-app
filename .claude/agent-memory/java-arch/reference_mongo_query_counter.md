---
name: mongo-query-counter
description: Test-only MongoQueryCounter (CommandListener) that proves the anti-N+1 guarantee by counting real Mongo wire commands; how to validate it and its known blind spot
metadata:
  type: reference
---

`MongoQueryCounter` + `MongoQueryCounterConfiguration` (in `infra/src/test/.../support/`) count real Mongo wire commands via a driver `CommandListener` registered through `MongoClientSettingsBuilderCustomizer`. Used to assert `PaymentTraceResolver` issues a constant number of queries regardless of payment/bullet/share fan-out.

**Why the two-scenario comparison works:** it compares command counts between a low-fan-out and a high-fan-out scenario, both pinning an active Share. Pinning the Share in *both* is load-bearing — adding a Share at all makes `findAllByShareIds` fire as a new query *type*, which would otherwise read as a false N+1 delta. Verified baseline: 5 commands for the 1-payment scenario.

**Verified sensitive, not tautological:** seeding a real N+1 into `PaymentTraceResolver` (per-bullet `findAllByIds` loop instead of one batch call) makes the assertion fail 5 vs 9. Re-run that mutation if you ever need to re-confirm the guard still bites.

**Known blind spot:** `ShareRepositoryImpl.findAllByIds` early-returns `Map.of()` on an empty collection *without issuing a query*. `payerFallbackShareIds` only fills when `payerId == null && shareId != null`, but `Payment.createShared(...)` always stamps `payerId` — so in these integration tests that set is always empty and the share-batch query never fires. The count is still valid (identical on both sides); it just means the share-resolution batch path is not what these tests exercise. That branch is covered at unit level in `PaymentTraceResolverTest` instead.

**How to apply:** when reviewing or extending query-count tests, always confirm the query *types* are held constant across scenarios and that the counted delta is attributable to fan-out count alone. Related: [[api-public-vertical-slice]].
