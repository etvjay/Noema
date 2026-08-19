# Protocol: noema-synchrony-benchmark

Experiment ID: `noema-synchrony-benchmark`
Protocol version: `noema-synchrony-benchmark-protocol-v1`
Fixture version: `noema-synchrony-benchmark-v1` (frozen at `2026-08-19T15:00:00Z`)

## Claim

The canonical venue synchronizer (`synchronizeEconomicObject`) preserves conflict
visibility, order invariance, duplicate idempotency, scope/revocation/staleness/finality
gating, and append-only versioning across an adversarial multi-venue corpus. A
deliberately degraded baseline must be detectably caught by the same benchmark, and any
failed case must be preservable with its exact permutation for deterministic CLI replay.

## Null / alternative

- Null: the canonical synchronizer silently loses conflicts, promotes unauthorized or
  stale/revoked/non-final evidence, diverges across delivery orderings, or creates
  spurious versions for at least one adversarial case.
- Alternative: the benchmark cannot detect a degraded baseline that ignores these
  invariants, so the metrics have no power to separate implementations.

## Method

1. Versioned, immutable corpus: `fixtures/synchrony/benchmark-v1.json` (14 cases) plus
   deterministic replay artifacts under `fixtures/synchrony/replay/`. The generator
   `tools/synchrony-benchmark-fixture.mjs` exists only for maintainability; the committed
   JSON is the source of truth.
2. For each case: deliver the venue deliveries in file order, reversed order, and one
   fixed deterministic shuffle (`tools/synchrony-benchmark-core.mjs` `orderingsFor`), and
   run the canonical synchronizer (`synchronizeEconomicObject`) plus the degraded baseline
   (`degradedSynchronize`).
3. Raw per-permutation runs are preserved separately from aggregate metrics
   (`raw-candidate.json`, `raw-baseline.json`). Metrics are derived in
   `deriveMetrics` and counterexamples in `counterexamplesFor`.
4. Cases that the canonical synchronizer must NOT admit (stale evidence, revoked
   attestation, out-of-scope attestation, non-final chain observation, spurious re-delivery)
   are asserted to be rejected without a material version.
5. Multi-phase cases (no-op-vs-material) thread object + history across phases and assert
   the first phase is material while the identical redelivery is a no-op.
6. Semantic/AI boundaries: `resolveSemanticRelationship` and
   `validateRepresentationEvidence` must never return economic equivalence for
   share-class mismatches, wrapper ambiguity without supported lineage, or forbidden
   evidence basis; an AI proposal claiming equivalence on insufficient dimensions is
   rejected, never promoted.
7. CLI replay: `noema synchrony replay` replays preserved scenarios and a preserved
   counterexample permutation to the identical synchronization root recorded by the
   benchmark, honoring the same policy gates (including staleness and evidenceIndex).

## Metrics and thresholds (fixed before full run)

- orderInvarianceRate = 1
- deterministicReplayRate = 1
- duplicateIdempotencyRate = 1
- silentConflictLossRate = 0
- unauthorizedScopePromotionRate = 0
- spuriousVersionRate = 0
- staleHandledRate = 1
- revocationHandledRate = 1
- reorgHandledRate = 1
- lateVisibleRate = 1
- supersededHandledRate = 1

## Validity review

- Leakage: the canonical implementation is exercised only through its public
  `synchronizeEconomicObject` surface; metrics derive from public result fields.
- Confounders: fixture semantics were aligned to the documented admission model
  (admissions include REJECTED records; promotion = ADMITTED + material change), so
  expectations measure promotion, not record counts.
- Generalization: this is an offline fixture corpus; it does not claim live multi-venue
  roundtrip behavior.

## Result

`PASS` (X1 offline fixture). The degraded baseline is caught on order invariance (0),
deterministic replay (0.64), duplicate idempotency (0), silent conflict loss (1),
unauthorized scope promotion (1), spurious versions (1), staleness (0), revocation (0),
and reorg handling (0); the canonical synchronizer passes every threshold.