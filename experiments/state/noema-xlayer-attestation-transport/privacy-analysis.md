# Privacy & leakage analysis — X Layer attestation transport (#62)

Scope: what must never be placed onchain, and what the adopted transport (A+B)
places onchain.

## Onchain surface (what IS committed)

- `registerObject` / `updateObject`: canonical 32-byte object and evidence
  roots (domain-separated hashes of canonical JSON projections).
- `attestClaim` / anchor / revoke: 32-byte envelope hash and lifecycle signal.
- Transaction sender (registry operator), calldata bytes, gas price, block
  metadata, event logs.

The onchain surface carries **hashes only**. No venue-proprietary economic
metadata is recoverable from the onchain state without access to the offchain
envelope or evidence set.

## MUST-NOT-ONCHAIN register

The following must never be placed onchain as plaintext:

1. Venue order, position, balance, or portfolio details.
2. Proprietary pricing, spreads, or liquidity data.
3. PII of end users (names, addresses, identifiers) outside canonical hashes.
4. Raw evidence bodies that are themselves confidential (only their roots).
5. The economic proposition plaintext when the venue requires confidentiality
   (only the envelope hash is anchored).
6. Builder Code / attribution values that would reveal operator identity when
   that identity is not otherwise public.

## Leakage risks of the rejected EAS path

EAS schema payloads are arbitrary `bytes`; adopting EAS invites encoding the
proposition plaintext into `data`, expanding the onchain surface and creating
a parallel discoverability surface. The envelope-anchored path keeps the same
strong property as the registry path: onchain witness is a hash.

## Replay/reorg privacy note

Reorg-aware reads (per ADR on observation finality) are required so that a
displaced onchain hash is never treated as settled evidence. A hash's history
is public regardless of transport; confidentiality of the underlying claim
rests on offchain envelope handling, not on chain behavior.