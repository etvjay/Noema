# Noema QA CLI Skill

## Purpose

Use this skill to iterate quickly on Noema integration experiments while preserving Research Foundry evidence discipline and Product Foundry product boundaries.

The CLI is a probe-and-receipt harness, not an authority source and not a deployment oracle.

Primary command:

```bash
pnpm qa -- <command>
```

Direct fallback:

```bash
node tools/noema-qa.mjs <command>
```

## Operating law

1. Inspect before integrating.
2. External documentation is feasibility evidence, not runtime proof.
3. A successful HTTP response is not automatically semantically relevant to Noema.
4. Every experiment emits a machine-readable receipt under `artifacts/qa/`.
5. Secrets must never appear in receipts, stdout, screenshots, fixtures, issues, or commits.
6. Read-only probes are the default.
7. State-changing experiments require an explicit write gate in a later command version plus a dedicated signer.
8. Product Truth cannot be changed by a successful sponsor/API experiment.

## Fast loop

Run:

```bash
pnpm qa -- suite
```

The suite executes:

```text
doctor
  ↓
xlayer
  ↓
eas
  ↓
mcp
```

Each command writes its own timestamped receipt.

Use the suite for rapid environment checks. Use individual commands when investigating a failure or freezing a fixture.

## Commands

### `doctor`

```bash
pnpm qa -- doctor
```

Checks:

- Node version
- pnpm availability/version
- Foundry availability/version
- `cast` availability/version
- git commit context
- Viem/Ox package presence
- presence only (never value) of relevant credentials/signers

A missing tool is evidence that the environment is not ready for that experiment. Do not silently substitute another toolchain.

### `xlayer`

```bash
pnpm qa -- xlayer
```

Or:

```bash
pnpm qa -- xlayer --rpc "$XLAYER_TESTNET_RPC"
```

Checks:

- `eth_chainId`
- hard assertion that X Layer testnet is `1952`
- latest block number
- client version when exposed
- bytecode presence for:
  - `L1Block`
  - `GasPriceOracle`
  - `SchemaRegistry`
  - `EAS`

Failure rule:

If chain ID is anything other than `1952`, the command fails closed. The known documentation example containing `195` must never be treated as an alternative testnet configuration.

### `mcp`

```bash
pnpm qa -- mcp
```

Default research endpoint:

```text
https://web3.okx.com/api/v1/onchainos-mcp
```

The command performs a real MCP transport sequence:

```text
initialize
  ↓
notifications/initialized
  ↓
tools/list
```

It records:

- HTTP status
- negotiated/returned initialization result
- whether `Mcp-Session-Id` is present
- complete returned tool catalog
- descriptions
- input schemas

It deliberately does **not** infer the server's role before `tools/list` succeeds.

Authentication can be supplied via:

```bash
export OK_ACCESS_KEY='...'
pnpm qa -- mcp
```

or explicitly:

```bash
pnpm qa -- mcp --header 'Header-Name:secret-value'
```

Header values are never included in receipts.

The tool must keep these three research objects distinct:

1. local `onchainos mcp` stdio server;
2. Onchain OS generic A2MCP Streamable-HTTP client behavior;
3. the supplied remote `web3.okx.com/api/v1/onchainos-mcp` server.

Do not claim equivalence without live evidence.

### `eas`

```bash
pnpm qa -- eas
```

Current v0.1 behavior is deliberately read-only. It checks bytecode presence for:

```text
SchemaRegistry 0x4200000000000000000000000000000000000020
EAS            0x4200000000000000000000000000000000000021
```

This is necessary but not sufficient proof that Noema can safely use the predeploys.

Before promoting EAS support, a later write-gated experiment must prove:

```text
schema registration
  ↓
attestation
  ↓
readback
  ↓
revocation
  ↓
revocation readback
```

and bind the attestation to canonical Noema identifiers/roots.

## Receipt model

Default output:

```text
artifacts/qa/
  doctor/
  xlayer/
  eas/
  mcp/
  suite/
  failures/
```

Each receipt must include at minimum:

- experiment kind
- QA CLI version
- observation timestamp
- target endpoint/RPC where non-secret
- raw structural results necessary to reproduce the conclusion
- explicit pass/failure state where applicable

Receipts are evidence artifacts. They are not automatically canonical product fixtures.

Promotion path:

```text
live QA receipt
   ↓
Research Foundry review
   ↓
source/authority classification
   ↓
normalized fixture or adapter contract
   ↓
deterministic test
   ↓
Product Foundry relevance check
   ↓
workstream implementation
```

## Experiment classification

### Read-only / safe default

Allowed without confirmation:

- RPC chain identity
- block/client version inspection
- `eth_getCode`
- MCP `initialize`
- MCP `tools/list`
- local toolchain checks
- contract/source verification status reads

### Non-destructive but externally billable

Requires explicit operator awareness before enabling:

- MCP `tools/call` where x402/payment may be triggered
- paid API calls
- high-volume polling

### State-changing

Must require an explicit `--write` gate and a signer in future versions:

- EAS schema registration
- EAS attestation/revocation
- NoemaRegistry deployment
- root commitments
- Builder Code attributed transactions
- token transfer/swap/DeFi operations

No state-changing command should ever be included in `suite`.

## Planned v0.2 commands

Implement only after their exact contract/API shapes are frozen:

```text
mcp call-safe

eas attest --write

eas revoke --write

registry deploy --write
registry commit --write

oklink verify

builder-code simulate
builder-code send --write

fixture promote <receipt>
receipt diff <a> <b>
```

The `fixture promote` command should copy a reviewed receipt into a versioned test fixture only after source authority and expected semantics are declared.

## Team use

Research Truth owner:

- runs and reviews `mcp`, `xlayer`, and external-tool probes;
- freezes observed tool/API contracts;
- records contradictions.

X Layer owner:

- uses X Layer/EAS/registry receipts;
- cannot redefine EconomicObject semantics.

Verification owner:

- consumes attestation evidence and defines what it means to Noema;
- does not own transport/deployment mechanics.

Evidence owner:

- promotes accepted external responses into typed `SourceSnapshot` / `Evidence` fixtures.

Integration owner:

- rejects PRs whose claimed capability lacks an appropriate receipt and deterministic test.

## Failure policy

Fail closed when:

- X Layer chain ID differs from expected configuration;
- MCP returns malformed JSON-RPC/SSE;
- `tools/list` cannot be inspected;
- required predeploy bytecode is absent;
- a dependency/tool is missing;
- authentication requirements are unknown;
- a result cannot be classified without inference.

Do not replace a failed live experiment with a fabricated fixture.
