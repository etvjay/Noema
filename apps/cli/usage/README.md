# Noema CLI Usage

**Command:** `noema`  
**Implementation:** `apps/cli/src/` (entry `apps/cli/bin/noema.mjs`)  
**Package:** `@noema/cli` (workspace)

## Purpose

Deterministic command-line interface for validating, inspecting, replaying,
and verifying Noema economic artifacts. Integrators, judges, coding agents,
and the QA/terminal surfaces use the same reusable canonical modules as the
REST/SDK/MCP surfaces — the CLI never implements parallel business logic.

The CLI runs on Node >= 24 using native TypeScript type-stripping plus the
repository loader at `apps/cli/loader.mjs`; no build step or separate runtime
is required.

## Usage

```bash
node apps/cli/bin/noema.mjs [--format text|json] <command> [args...]
```

`--format text` (default) renders human-readable output; `--format json`
renders machine-readable JSON `{ code, summary, details }`.

### Commands

| Command | Behavior | Exit codes |
| --- | --- | --- |
| `schema validate <artifact>` | Validate a JSON artifact against the canonical schema registry | 0/1/5 |
| `source inspect <snapshot>` | Inspect a SourceSnapshot artifact | 0/1/5 |
| `source capture <raw-document>` | Compute the canonical content hash of a raw JSON document and form a SourceSnapshot | 0/1 |
| `source replay <snapshot> <evidence-input>` | Replay a snapshot through ingestion into Evidence | 0/1/3/5 |
| `representation inspect <identity>` | Inspect a RepresentationIdentity and its identity key | 0/1 |
| `representation validate <identity-pair>` | Classify the relationship between two representation identities | 0/1/2 |
| `roots compute <object>` | Compute objectRoot/evidenceRoot byte-for-byte via the canonical library | 0/1/5 |
| `roots verify <object>` | Verify an object's claims/evidence and report PASS/FAIL/UNRESOLVED | 0/1/2/4/5 |
| `object inspect <object>` | Inspect an EconomicObject summary | 0/1/5 |
| `object diff <object> <object>` | Report whether the change between two objects is material | 0/1/5 |
| `attestation sign <artifact> [--key <hex>]` | EIP-712 sign a venue attestation envelope (key from `NOEMA_ATTESTER_KEY` or `--key`; key is never printed/persisted) | 0/1 |
| `attestation verify <artifact>` | Verify envelope signature + authority scope | 0/1/4 |
| `attestation revoke-check <artifact>` | Report envelope lifecycle status (ACTIVE/EXPIRED/REVOKED/SUPERSEDED/CONFLICTING) | 0/1/2 |
| `synchrony replay <scenario> [--shuffle]` | Replay a multi-venue scenario and prove deterministic convergence across orderings | 0/1/2/5 |
| `profile evaluate <profile> <object> [reference-profile]` | Evaluate a representation profile against an economic object | 0/1/2/5 |
| `receipt verify <receipt> [object]` | Recompute roots and compare against a verification receipt | 0/1/2/4/5 |
| `doctor` | Report node/schema/runtime/module compatibility and external prerequisites without claiming live proof | 0 |

### Exit codes

`0 VALID` · `1 INVALID` · `2 UNRESOLVED` · `3 SOURCE_FAILURE` ·
`4 VERIFICATION_FAILURE` · `5 UNSUPPORTED_VERSION` · `64 USAGE` · `70 INTERNAL`

## Minimal examples

```bash
# Validate a schema artifact
noema schema validate apps/cli/examples/rwa-source-snapshot.json

# Compute canonical roots (byte-for-byte identical to computeRoots)
noema roots compute apps/cli/examples/rwa-object.json

# Verify a receipt against its object
noema receipt verify apps/cli/examples/rwa-verification-receipt.json apps/cli/examples/rwa-object.json

# Replay an adversarial multi-venue scenario and prove deterministic convergence
noema synchrony replay apps/cli/examples/adversarial-multi-venue-scenario.json
# Replay a preserved benchmark counterexample permutation (fixtures/synchrony/replay/)
noema synchrony replay fixtures/synchrony/replay/out-of-order-agreement-permutation.json

# Sign and verify a venue attestation envelope
NOEMA_ATTESTER_KEY=<hex> noema attestation sign apps/cli/examples/rwa-attestation.json
noema attestation verify apps/cli/examples/rwa-attestation-signed.json

# Machine-readable output
noema --format=json roots compute apps/cli/examples/rwa-object.json
```

## Canonical invariants preserved

- The CLI never silently mutates canonical artifacts during validation/replay.
- Root computation is the canonical `computeRoots`; verification is the
  canonical `verifyEconomicObject`.
- Sign/verify paths do not print or persist private keys/secrets.
- `doctor` reports prerequisites without claiming live proof where none exists.

## Dependency/runtime requirements

- Node >= 24 (native type-stripping).
- Workspace packages: `@noema/canonicalization`, `@noema/economic-kernel`,
  `@noema/noema-core`, `@noema/schemas`, `@noema/verification`; plus `viem`
  for EIP-712 signing.

## Integrity tests / QA gates

- `tests/integrity/cli-conformance.test.ts` — CLI conformance gate
  (`cli-conformance` in `qa/noema-integrity.json`).

## Compatibility / version notes

- CLI commands emit one honest state and one exit code per invocation.
- Live EVM/RPC claims are outside this CLI; use the QA probes for live evidence.