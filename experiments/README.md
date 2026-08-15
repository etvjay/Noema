# Noema Experiment Loop

Noema uses Experiment Foundry to govern experiments and `noema-qa` to execute fast probes.

## Separation of responsibility

- **Product Foundry** owns Product Truth and acceptance authority.
- **Research Foundry** owns current external evidence and competing explanations.
- **Experiment Foundry** owns hypothesis design, protocol, measurement, validity, replication, and experimental evidence level.
- **Noema QA** is the execution/instrumentation adapter. Its receipts are raw observations, not conclusions.

## Fast build-alongside loop

```text
implementation change
      ↓
unit / deterministic tests
      ↓
pnpm experiment -- next <experiment>
      ↓
pnpm qa -- <relevant probe>
      ↓
raw QA receipt
      ↓
pnpm experiment -- observe-receipt ...
      ↓
derived metric / validity review
      ↓
accept / weaken / reject / redesign recommendation
      ↓
Product Foundry decides whether implementation state changes
```

Do not wait until the end of the build to run experiments. Run the relevant lane whenever its implementation assumption changes.

## Runtime bootstrap

The Experiment Foundry runtime is intentionally not vendored into Noema source. Extract the supplied release bundle into a local/Codespace runtime:

```bash
pnpm experiment -- bootstrap --bundle /path/to/experiment-foundry-agent-install-bundle-0.1.0.zip
```

The extracted runtime lives under `.tools/experiment-foundry/` and is ignored by git.

Canonical experiment project state is persisted under:

```text
experiments/state/<experiment-id>/
```

That state is versionable and reviewable with Noema.

## Initial experiment lanes

### `noema-okx-mcp-contract`

Claim to test: the supplied remote OKX Onchain OS MCP endpoint exposes a stable, useful tool contract that can safely support one or more Noema evidence/discovery workflows.

Start at X0. Use `pnpm qa -- mcp` only after protocol and metric contracts are frozen. A successful `tools/list` is not enough to prove product relevance.

### `noema-xlayer-runtime`

Claim to test: current X Layer testnet behavior and documented predeploys are suitable for Noema's registry/attestation path.

Target X3 for deployment decisions. Probe chain identity, RPC behavior, predeploy code, later transaction/event/finality behavior.

### `noema-semantic-resolution`

Claim to test: Noema deterministically distinguishes true equivalence, related-but-non-equivalent exposure, and stale/conflicting evidence without ticker/name shortcuts.

Start with X1 fixtures, advance to X2 controlled replay with normalized evidence.

### `noema-root-replay`

Claim to test: identical canonical inputs reproduce identical object/evidence roots and receipts, while material evidence changes produce the expected different roots.

Target X2 before live commitment work.

### `noema-eas-revocation`

Claim to test: native X Layer EAS can carry a versioned Noema-bound attestation and revocation signal that propagates deterministically into claim/object/mandate re-evaluation without becoming a parallel truth model.

Start read-only at X0/X1; write-gated testnet roundtrip is X3.

### `noema-registry-commitment`

Claim to test: NoemaRegistry can commit canonical roots on X Layer testnet and an independent observer can trace transaction → event → object version → offchain receipt.

Target X3.

### `noema-watch-revaluation`

Claim to test: a material evidence change or revocation produces vN+1, re-verification, mandate re-evaluation, semantic event, and notification without mutating history.

Start X1/X2; target X3 once external change detection is live.

## Useful commands

```bash
pnpm experiment -- validate
pnpm experiment -- init noema-okx-mcp-contract --name "OKX MCP Contract Discovery"
pnpm experiment -- workflow noema-okx-mcp-contract claim-to-experiment-truth --request "Test whether the supplied remote OKX MCP endpoint exposes a stable and Noema-relevant tool contract without assuming its capabilities."
pnpm experiment -- status noema-okx-mcp-contract
pnpm experiment -- next noema-okx-mcp-contract
pnpm experiment -- qa mcp
```

Bind an accepted QA receipt into Experiment Truth only after its metric is declared:

```bash
pnpm experiment -- observe-receipt noema-okx-mcp-contract \
  --receipt artifacts/qa/mcp/<receipt>.json \
  --id OBS-MCP-001 \
  --metric discovered_tool_count \
  --value 12 \
  --unit tools \
  --trial MCP-TRIAL-001
```

The bridge stores the receipt path and SHA-256 in the observation source/notes so raw evidence cannot silently change underneath a result.

## Honest terminal states

Use Experiment Foundry's terminal states without reinterpretation:

- `pass`
- `fail`
- `inconclusive`
- `redesign-required`
- `reopening-required`

A failed experiment is not a failed build. It is evidence that an assumption, integration, or implementation path needs to change.
