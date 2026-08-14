# ADR 0004: X Layer registry

## Context

Noema needs a small shared commitment and attestation surface.

## Decision

Start with one minimal NoemaRegistry contract. Store object/evidence roots,
version state, claim attestations, revocations, and representation commitments;
keep economic meaning offchain.

## Consequences

The contract remains auditable and composable without becoming an oracle,
lending market, or AI runtime.

## Reopen condition

Reopen if measured state growth or privilege boundaries require a contract
split.
