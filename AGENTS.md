# Noema Agent Governance Contract

This file is the portable execution contract for any coding agent working on Noema, including agents that cannot load the private Product Foundry, Research Foundry, Experiment Foundry, or Noema QA skill bundles.

The absence of a skill runtime does not relax the underlying rules. Repository artifacts and executable gates are the source of operational enforcement.

## Authority order

When implementation guidance conflicts, use this order:

1. `PRODUCT_TRUTH.md` and canonical Noema product invariants.
2. The active GitHub issue acceptance criteria and dependency boundaries.
3. `qa/noema-integrity.json` and `skills/noema-qa/SKILL.md` for integrity semantics.
4. `RESEARCH_LEDGER.md` and current first-party evidence for external implementation facts.
5. `experiments/README.md` and persisted Experiment Foundry state for experimental claims.
6. Canonical design/reference documents under `docs/reference/`.
7. Existing code/tests, unless they conflict with a higher authority.

Never weaken a higher-authority contract merely to make tests green.

## Required reading before changing canonical code

Read at minimum:

- `PRODUCT_TRUTH.md`
- the issue(s) being implemented
- `skills/noema-qa/SKILL.md`
- `qa/noema-integrity.json`
- `RESEARCH_LEDGER.md` when any external API/model/network/tool behavior is involved
- `experiments/README.md` when making a performance, correctness, robustness, integration, or model-quality claim

For Noema AI issues #23–#31, also preserve the proposal-only boundary described in those issues.

## Product Foundry portable contract

Product Truth is acceptance authority.

Do not broaden Noema because an API, model, chain primitive, framework, or sponsor capability exists.

Every implementation must preserve at least these invariants:

- Noema models economic objects, not merely tokens.
- Every action-relevant conclusion is traceable to evidence or explicit inference.
- AI inference cannot silently become `VERIFIED`.
- Similar exposure is not economic equivalence.
- Technical representation is not economic identity.
- Stale, conflicting, revoked, missing, and ambiguous evidence remains visible.
- Historical canonical versions are not silently overwritten.
- Noema does not own execution authority.
- Noema does not claim universal economic truth.

A PR may change Product Truth only with explicit human/Product Foundry acceptance. An implementation convenience is not authority to reinterpret the product.

## Research Foundry portable contract

Any material external fact that affects code MUST be verified against current first-party evidence before implementation.

Examples include:

- OpenAI API/model/tool-calling/Structured Output behavior;
- X Layer RPC/network/predeploy behavior;
- OKX/OnchainOS/MCP contracts;
- EIP/EAS/attestation behavior;
- library/framework APIs whose versions can change.

For each such dependency:

1. State the exact claim being relied on.
2. Record the first-party source and version/date when relevant.
3. Record the claim in `RESEARCH_LEDGER.md` or a scoped research artifact.
4. Distinguish documentation/source evidence from observed runtime proof.
5. Capture runtime receipts/hashes/logs when claiming implemented or deployed behavior.
6. If sources conflict, record the contradiction and fail closed until resolved.

A URL is evidence of documentation, not evidence that an integration works.

Do not use marketing copy as implementation authority when primary technical documentation or observed behavior is available.

## Experiment Foundry portable contract

QA observations are not automatically experimental conclusions.

For any material claim such as "the model reliably extracts claims", "false equivalence is acceptably low", "this adapter is replay-safe", or "this integration is stable":

1. State a falsifiable claim and null/alternative.
2. Define fixtures/dataset and baseline before evaluating the result.
3. Define metrics and failure thresholds before the full run.
4. Preserve raw observations separately from derived metrics.
5. Record model/prompt/schema/tool versions for AI experiments.
6. Perform validity review: leakage, cherry-picking, confounders, unsupported generalization, environment dependence.
7. Return one honest state: `pass`, `fail`, `inconclusive`, `redesign-required`, or `reopening-required`.
8. Do not promote an experimental result into Product Truth without explicit acceptance.

If the Experiment Foundry runtime is available, use the repository bridge:

```bash
pnpm experiment -- validate
pnpm experiment -- status <experiment-id>
pnpm experiment -- next <experiment-id>
```

If the runtime is unavailable, DO NOT fabricate Experiment Foundry receipts. Commit the protocol, raw fixtures/observations, and stated limitation so the experiment can be replayed later with the canonical runtime.

## Noema QA contract

Install exactly from the lockfile, then run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm qa
```

`pnpm qa` is the canonical full-system integrity command. It writes a machine-readable receipt under:

```text
artifacts/qa/integrity/
```

Possible gate states:

- `PASS`: implemented and proven.
- `FAIL`: implemented/asserted but failed.
- `NOT_IMPLEMENTED`: required proof does not exist yet; never green.
- `BLOCKED`: required environment/runtime/dependency is unavailable; never green.

Do not delete, disable, rename, weaken, or bypass a required gate to obtain green CI.

During development, overall QA may remain `INCOMPLETE` because unrelated future product gates are still `NOT_IMPLEMENTED`. A PR may be considered locally acceptable only when:

1. `pnpm typecheck` passes;
2. `pnpm test` passes;
3. every QA gate that was PASS before the change remains PASS;
4. every QA gate owned by the issue is PASS;
5. no new FAIL is introduced;
6. remaining NOT_IMPLEMENTED/BLOCKED gates are explicitly unrelated or declared dependencies, not hidden failures in the issue's scope.

Production/release acceptance requires all required release gates to PASS and required live claims to have live proof.

## Focused probes

Use probes only as raw instrumentation/debugging evidence:

```bash
pnpm qa:probe -- doctor
pnpm qa:probe -- xlayer
pnpm qa:probe -- eas
pnpm qa:probe -- mcp
pnpm qa:probe -- suite
```

Probe success does not by itself prove full-system integrity or product relevance.

Live integrity is explicit:

```bash
pnpm qa -- --live
```

Conditional external claims become mandatory only when claimed, for example:

```bash
NOEMA_CLAIM_OKX_MCP=true pnpm qa -- --live
NOEMA_CLAIM_EAS=true pnpm qa -- --live
```

## Noema AI constitutional boundary

For issues #23–#31, model output is always a proposal.

A model MUST NOT:

- mark a claim `VERIFIED`;
- mutate canonical `EconomicObject` state;
- select canonical truth by confidence alone;
- submit transactions;
- invoke downstream execution;
- suppress conflicting evidence;
- treat source/document text as system instructions;
- expose or request secrets through source tools.

AI output must be strict structured data with source/evidence locators. Invalid model output is rejected, not coerced.

The required path is:

```text
SourceSnapshot
  -> Evidence
  -> Noema AI proposal
  -> deterministic promotion/rejection
  -> EconomicObject
  -> VerificationReceipt
  -> Mandate
  -> DecisionReceipt
```

## Noema AI minimum production evidence

An AI integration PR must not claim completion until it proves, as applicable:

- strict proposal/runtime schemas;
- deterministic proposal hashing and run provenance;
- evidence/source locators for action-relevant proposals;
- malformed output rejection;
- prompt-injection/hostile-evidence isolation;
- no direct canonical writes from model/tool calls;
- deterministic promotion/rejection reasons;
- Case A true equivalence derived from qualifying evidence;
- Case B share-class/rights mismatch refuses equivalence;
- Case C similar exposure remains non-equivalent;
- stale/missing/conflicting evidence fails closed or remains unresolved;
- benchmark fixtures are versioned;
- false equivalence and false-ALLOW are first-class metrics;
- model, prompt, schema, and tool versions are recorded;
- raw model outputs/receipts remain distinct from derived evaluation metrics.

## Required PR handoff

Every material PR must state:

- issue(s) implemented;
- inputs and outputs;
- Product Truth invariants touched;
- external facts relied upon and their evidence status;
- fixtures/tests added;
- `pnpm typecheck` result;
- `pnpm test` result;
- `pnpm qa` receipt path and gate summary;
- Experiment Foundry result or explicit reason it could not be run;
- known NOT_IMPLEMENTED/BLOCKED dependencies;
- backward-compatibility/schema impact;
- secrets/security considerations;
- exact commit SHA tested.

"Tests pass" is not sufficient evidence of production readiness.
