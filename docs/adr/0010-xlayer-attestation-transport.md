# ADR 0010: X Layer attestation and commitment transport

Status: Accepted (experiment #62)

## Context

Economic objects, their evidence, and venue attestations must be committed on
X Layer such that history is append-only, attestations and revocations are
discoverable, and verifiers can independently confirm what Noema/an attestor
committed — without asserting the underlying claim is universally true.

Three transport families were evaluated:

- **A: Noema-native registry commitment** (`NoemaRegistry`, ADR 0004) — commits
  object/evidence/attestation roots with append-only history and revocation.
- **B: signed offchain Venue Economic Attestation envelope + onchain
  root/history anchoring** — the envelope (attestation module, #59) carries the
  attestation; only the envelope hash and lifecycle signal anchor onchain.
- **C: EAS onchain attestation primitive** — evaluated only because EAS and
  SchemaRegistry predeploys exist on X Layer; **never assume official support**.

## Observed evidence (read-only, live X Layer testnet 1952)

- EAS and SchemaRegistry are OP-Stack predeploys at
  `0x4200000000000000000000000000000000000021` / `0x...20` (code present,
  2059 bytes each), versions reported as `1.4.1-beta.3` / `1.3.1-beta.2`.
- The EAS organization does **not** list X Layer in its official deployment
  registry or documentation — the predeploys are operator-deployed genuine EAS
  code, not an EAS-supported integration.
- X Layer testnet identity confirmed: chainId 1952, client
  `reth/v2.3.0-.../xlayer/v0.0.7`, L1Block/GasPriceOracle predeploys present.

## Measured tradeoffs (see `raw-measurement.json`)

| Operation | Calldata bytes | Calldata gas (EIP-2028) | Est. total gas (incl. 21000 base) |
| --- | --- | --- | --- |
| A: `registerObject` | 100 | 1600 | 22600 |
| A: `attestClaim` / revoke | 100 | 1600 | 22600 |
| B: anchor / revoke envelope | 100 | 1600 | 22600 |
| C: `registerSchema` | 229 | 2080 | 23080 |
| C: `attest` (envelope payload) | 292 | 2020 | 23020 |

Costs are comparable; EAS is not cheaper in calldata and adds schema
registration overhead. Prices were applied against live `eth_gasPrice`
(20,000,001 wei) but **no transaction was broadcast** — a live write roundtrip
is still required before production transport claims.

## Decision

Use **A + B together**, not EAS, for X Layer attestation and commitment:

1. **A (native registry commitment)** is the version/root/history transport for
   objects and evidence.
2. **B (signed envelope + onchain anchoring)** is the attestation transport:
   the signed Venue Economic Attestation envelope carries economic semantics;
   the registry anchors only the envelope hash with lifecycle signals
   (anchor/revoke).
3. **C (EAS) is rejected** pending evidence of official EAS support for X
   Layer, because adoption would duplicate schema/revocation state that the
   registry and envelope already provide, without cost or privacy benefit, and
   would create vendor lock-in and a second discoverability surface.

Rationale: A+B preserves product semantics regardless of transport choice
(attestation envelope semantics from #59 are transport-agnostic), keeps
attestor/schema/evidence correlation explicit, keeps onchain metadata minimal
(privacy), and keeps Noema able to change transports without contract rewrites.

## Consequences

- Attestation validity is independently checkable from signer, schema, evidence
  roots, and revocation state (envelope + registry).
- The X Layer commitment proves what Noema/attestor committed, not universal
  truth of the underlying claim — enforced by the commitment model.
- Historical object/attestation versions remain independently traversable via
  the registry commitment history and Noema versioning.
- Builder Code suffix preserves canonical attestation/commitment calldata
  semantics (Builder Codes are transaction-level attribution, orthogonal to
  calldata shape; see RESEARCH_LEDGER).
- Privacy analysis (see `experiments/state/noema-xlayer-attestation-transport/privacy-analysis.md`): only 32-byte canonical
  roots/envelope hashes and lifecycle signals are ever placed onchain;
  venue-proprietary economic metadata must never be placed onchain.

## Reopen condition

Reopen only if (a) EAS/X Layer official support is demonstrated and an
adoption tradeoff study shows a strict improvement, or (b) a live write
roundtrip on X Layer testnet falsifies the A+B measurements, or (c) a
demonstrated venue/verifier requirement cannot be satisfied by A+B.