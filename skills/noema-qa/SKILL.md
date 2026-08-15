# Noema Integrity QA Skill

## Purpose

Noema QA exists to measure the integrity of the **entire Noema system**, not merely its integrations.

Primary command:

```bash
pnpm qa
```

Optional live gates:

```bash
pnpm qa -- --live
```

Subsystem probes remain available separately:

```bash
pnpm qa:probe -- doctor
pnpm qa:probe -- xlayer
pnpm qa:probe -- eas
pnpm qa:probe -- mcp
pnpm qa:probe -- suite
```

The integrity runner is governed by:

```text
qa/noema-integrity.json
```

## Constitutional rule

QA answers:

> Does the current repository preserve Noema Product Truth and prove the required behavior of every implemented layer of the golden path?

It does **not** answer only:

> Do the APIs and chain endpoints respond?

External probes are subordinate integrity checks under the full system.

## Status model

Every gate returns exactly one of:

- `PASS` — implemented and proven by the declared check.
- `FAIL` — implemented/asserted but the declared check failed.
- `NOT_IMPLEMENTED` — required integrity behavior is not yet implemented. This is never green.
- `BLOCKED` — required environment/runtime/credential/live dependency prevents execution. This is never green.

Overall Noema integrity is `PASS` only when every required active gate is `PASS`.

A compiling repository is not equivalent to an integrity-pass.

## Full integrity surface

The QA contract covers:

1. **Product Truth / constitutional integrity**
   - Evidence-Bounded Economic Object remains the primitive.
   - AI inference cannot silently become VERIFIED.
   - similar exposure does not imply equivalence.
   - historical versions are never silently overwritten.
   - Noema does not claim universal truth.
   - negative product boundaries remain intact.

2. **Repository/foundation integrity**
   - TypeScript typecheck.
   - currently implemented deterministic tests.
   - strict runtime schemas.

3. **Evidence integrity**
   - actionable conclusions traverse `Claim -> Evidence -> SourceSnapshot`.
   - provenance and authority remain explicit.
   - missing/stale/conflicting/revoked evidence remains visible.

4. **Semantic integrity**
   - relationship classifications are derived from evidence and rules.
   - true equivalence, share-class relationships, similar exposure, and ambiguity are distinguishable.
   - ticker/name equality is never sufficient.
   - fixture expectation labels are not themselves semantic proof.

5. **Canonicalization / replay integrity**
   - identical canonical inputs produce identical roots.
   - material evidence changes produce the expected different root.
   - hashing/version rules are explicit and reproducible.

6. **Verification integrity**
   - `INFERRED` cannot silently become `VERIFIED`.
   - freshness, conflicts, revocation and source failures propagate deterministically.
   - receipts preserve rule/evidence/version lineage.

7. **Mandate integrity**
   - identical object + verification + mandate inputs produce deterministic `ALLOW | CONDITIONAL | BLOCK` decisions.
   - decisions expose the checks that produced them.

8. **Versioning/watch integrity**
   - material change creates `vN+1`.
   - history is append-only from the semantic point of view.
   - change triggers re-verification and mandate re-evaluation.

9. **Commitment integrity**
   - `NoemaRegistry` passes deterministic contract tests.
   - live proof, when enabled, preserves transaction/event/root/object/receipt traceability.

10. **Machine-interface integrity**
    - REST, SDK and Noema MCP consume canonical domain semantics.
    - interface errors preserve uncertainty rather than invent success.

11. **UI semantic integrity**
    - UI renders canonical decisions/evidence/uncertainty/version state.
    - UI does not implement independent equivalence, verification or mandate logic.

12. **Golden-path integrity**
    - one end-to-end trace must eventually prove:

```text
resolve
  -> evidence
  -> verify
  -> interpret
  -> evaluate
  -> commit
  -> watch
  -> re-evaluate
  -> notify
```

and permit inspection from:

```text
DecisionReceipt
  -> Claim
  -> Evidence
  -> Source
  -> hash/attestation/onchain commitment
```

## Current honesty rule

Missing integrity tests are intentionally represented as `NOT_IMPLEMENTED`.

For example, the legacy semantic fixture suite currently checks expected labels stored in fixture JSON. It does not execute a semantic resolver. Therefore the full QA contract requires a separate executable semantic integrity test before that layer can become `PASS`.

Do not weaken the integrity manifest merely to make the dashboard green.

## Live and ecosystem checks

Live network checks run only with:

```bash
pnpm qa -- --live
```

External/sponsor integrations are conditional claim gates. They become required only when Noema actually claims the capability.

Examples:

```bash
NOEMA_CLAIM_OKX_MCP=true pnpm qa -- --live
NOEMA_CLAIM_EAS=true pnpm qa -- --live
```

This prevents an optional sponsor integration from defining Noema integrity while also preventing us from claiming an unproven integration.

## Subsystem probes

`pnpm qa:probe` remains the fast instrumentation layer for Experiment Foundry and debugging.

Current probes:

- `doctor`
- `xlayer`
- `eas`
- `mcp`
- `suite`

Probe receipts are raw observations under `artifacts/qa/`. They are not automatically system conclusions.

## Relationship to Experiment Foundry

```text
Noema Integrity QA
    measures system invariants and required behavior

Noema subsystem probes
    capture raw runtime observations

Experiment Foundry
    defines falsifiable claims, protocols, metrics, validity and evidence level

Product Foundry
    decides whether Product Truth / implementation state changes
```

A typical loop is:

```text
implementation change
  -> pnpm qa
  -> inspect FAIL / NOT_IMPLEMENTED / BLOCKED gates
  -> run focused pnpm qa:probe when needed
  -> run corresponding Experiment Foundry protocol
  -> implement or redesign
  -> pnpm qa again
```

## Failure policy

Never convert any of these into a pass by assumption:

- missing implementation;
- missing executable semantic logic;
- unavailable external dependency;
- incomplete provenance;
- inference represented as verification;
- stale/revoked evidence ignored;
- version history overwritten;
- interface model divergence;
- live integration not actually exercised.

QA is allowed to stay red while Noema is under construction. That is the point: the integrity report is the honest map of what remains to be made true.
