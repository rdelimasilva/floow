# Deferred Items — Phase 04

## Pre-existing TypeScript Error (out of scope)

**File:** `packages/core-finance/src/import/ofx.ts:55`
**Error:** `Argument of type 'string | number' is not assignable to parameter of type 'string'. Type 'number' is not assignable to type 'string'.`
**Confirmed pre-existing:** Error exists before Plan 04-01 changes (verified via git stash).
**Impact:** Does not affect new planning modules (simulation.ts, withdrawal.ts, succession.ts).
**Action:** Fix in a separate maintenance task.
