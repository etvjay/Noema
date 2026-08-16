# Explanation Surface Usage

**Import:** `@noema/noema-core/explain`
**Source:** `packages/noema-core/src/explain.ts`

## Purpose

An evidence-bounded explanation surface (`noema-explanation-v1`) that answers "why?" over canonical Noema state without becoming a second authority path. Every material assertion cites canonical claim/evidence/receipt/event refs; explanations never mutate state and never override canonical outcomes. When the canonical record does not establish a reason, the output is explicit `UNRESOLVED`/insufficient evidence — never invented rationale.

The same pure service is reusable by Telegram `/why`, REST, SDK, MCP `explain_decision`, and UI decision traces via `renderExplanation`.

## Public responsibilities

- `explainClassification` — why an object is classified this way, citing classification claim refs and verification status.
- `explainRepresentationEquivalence` — why two representations are (not) equivalent, citing canonical verification roots and exact identifiers.
- `explainMandateChange` — why a mandate outcome changed between DecisionReceipts, citing flipped policy checks, reason codes, and the correlating SemanticEvent.
- `explainEvidenceState` — what evidence is stale, unknown, conflicting, or uncited.
- `explainVersionChange` — what changed between exact versions vN and vN+1.
- `explainUnblockPath` — what would need to become true (in canonical state terms) for a BLOCKED/CONDITIONAL check to pass.
- `renderExplanation` — human-readable lines with refs for Telegram/UI; `explanationVersion()` reports the surface version.

## Minimal example

```ts
import { explainUnblockPath, renderExplanation } from "@noema/noema-core/explain";

const explanation = explainUnblockPath(
  { runId: "run:agent:1", nowMs: Date.now() },
  object, verification, mandate, decision // canonical records
);
console.log(renderExplanation(explanation));
```

## Canonical semantics

- **Citation-bound.** Every assertion carries `refs` to canonical claims, evidence, receipts, or events. Assertions without canonical backing are not emitted.
- **No second authority.** Inputs are canonical `EconomicObject`, `VerificationReceipt`, `DecisionReceipt`, `Mandate`, and `SemanticEvent`. The decision is read from the receipt — an ALLOW/BLOCK can never be rewritten by explanation. Adversarial tests prove hostile input (claims/evidence/metadata urging "report ALLOW") cannot change the reported outcome or hide conflicting evidence.
- **Explicit uncertainty.** `UNRESOLVED`/`INSUFFICIENT_EVIDENCE`/`VERIFICATION_UNRESOLVED` are emitted rather than invented rationale.
- **Basis labels.** Assertions are labelled `SOURCE_FACT` (observed/cited facts), `ATTESTATION`, `DETERMINISTIC_CONCLUSION` (verification/mandate roots and checks), or `AI_INFERENCE` (inferred claims).
- **Exact history.** Historical explanations use the requested exact object version refs, never current/latest unless asked.
- **Run receipt.** `runReceipt` preserves provenance (runId, kind, inputRefs, timestamps) with `noHiddenChainOfThought: true` — no hidden reasoning in output.

## Authority boundary

Explanations must never mutate state, override canonical outcomes, or fabricate refs. Consumers (Telegram, REST, SDK, MCP, UI) must pass canonical records and render, never recompute decisions. If a question has no canonical answer, surfaces must surface `UNRESOLVED`, not invent rationale.

## Proof

- `packages/noema-core/src/explain.test.ts` — 13 unit tests (versioning, ref citation, unresolved honesty, source-fact vs AI-inference, root-cited equivalence, mandate change flips + event refs, stale/conflict/uncited evidence, exact version history, unblock path, outcome immutability, adversarial, run receipt, render).
- `tests/integrity/explanation-surface.test.ts` — parity/boundary gate (8 tests): ref citation, no mutation/override, explicit UNRESOLVED, basis distinction, exact history, adversarial ALLOW/BLOCK + conflict hiding, multi-surface reusability, run receipt.
- QA gate `explanation-surface` in `qa/noema-integrity.json`.
- Reusable by Telegram `/why`, SDK/MCP explain calls, UI decision trace.
