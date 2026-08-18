# Experiment: Noema X Layer Attestation & Commitment Transport

**Experiment ID:** `noema-xlayer-attestation-transport`
**Issue:** #62 — Representation & Synchrony: Experiment with X Layer attestation and commitment transport
**Protocol version:** `noema-xlayer-attestation-transport-protocol-v1`
**Status:** DECISION-RECORDED (runtime unavailable; protocol + raw observations committed per portable contract)

## Falsifiable claim

> The correct X Layer transport for Noema economic attestations and version
> commitments is the Noema-native registry commitment of canonical roots plus
> signed offchain Venue Economic Attestation envelopes anchored by
> root/history hashing — NOT a separate EAS/external attestation primitive —
> because the native+envelope-anchored design preserves product semantics,
> keeps attestor/schema/evidence correlation explicit, and avoids vendor
> lock-in without measurable cost or privacy benefit.

Null/alternative: if EAS or another official X Layer-supported attestation
primitive provides strictly better append-only history, attestor/revocation
discoverability, schema binding, cost, independent verification, and privacy
characteristics, the transport should be switched.

## Transport patterns evaluated

1. **A: Noema-native registry commitment** — `NoemaRegistry` commits
   object/evidence/attestation roots with append-only history and revocation
   (`registerObject`/`updateObject`/`attestClaim`/`revokeAttestation`).
2. **B: signed offchain Venue Economic Attestation envelope + onchain
   root/history anchoring** — envelope (per `attestation` module, #59)
   carries the economic attestation; only the envelope hash and lifecycle
   signal are anchored onchain.
3. **C: EAS onchain attestation primitive** — evaluate whether EAS on X Layer
   justifies adoption (verify current official support first; never assume).

## Metrics (frozen before full run)

| Metric | Definition | Threshold for adoption |
| --- | --- | --- |
| Append-only history | full version/attestation history independently traversable | must hold |
| Attestor/revocation discoverability | who attested, current revocation state readable | must hold |
| Schema/version binding | attestation bound to schema + version | must hold |
| Object/representation/evidence correlation | attestation links to object/representation/evidence | must hold |
| Calldata cost | measured calldata bytes + EIP-2028 gas on live gas price | lower is better; not a blocker |
| Independent verification | verifier needs no vendor tooling | must hold |
| Privacy/leakage | onchain metadata minimization | must hold |
| Indexer/query ergonomics | query surface | preferred, not blocker |
| Upgradeability / vendor lock-in | Noema can change transport without contract rewrite | must hold |
| Builder Code attribution | Builder Code suffix does not alter canonical calldata semantics | must hold |
| Replay/reorg handling | reorg/finality-aware reads | must hold |

## Raw observations

- `raw-eas-predeploy-probe.json` — read-only `eth_getCode` probe of EAS and
  SchemaRegistry OP-Stack predeploys on X Layer testnet (1952).
- `raw-xlayer-probe.json` — chain identity, client version, latest block, and
  predeploy code presence on X Layer testnet (1952).
- `raw-measurement.json` — calldata byte + EIP-2028 gas measurement for each
  transport operation, priced at the live `eth_gasPrice` (no broadcast).

## Validity / limitations

- Evidence level: X1/OFFLINE-FIXTURE for cost measurement + observed-runtime
  read-only probe for chain/predeploy presence. No live transaction was
  broadcast (testnet funding for the publisher key is still pending).
- A live write roundtrip (register + event readback) must be recorded before
  this experiment authorizes production transport claims.
- The Experiment Foundry runtime was not installed; the protocol, raw
  observations, and decision record are committed so the experiment can be
  replayed with the canonical runtime later.

## Result

See `result.json` and `docs/adr/0010-xlayer-attestation-transport.md`.
