# ADR 0009: Execution is downstream

## Context

Understanding an asset and authorizing an action are distinct responsibilities.

## Decision

Noema returns evidence, verification, mandate, and financeability outputs. It
does not own wallet authority, trade execution, or recovery.

## Consequences

Truss, Corridor, execution adapters, and Gaia can compose with Noema without
turning it into a monolith.

## Reopen condition

Do not reopen for the MVP. Any future execution integration must preserve the
authority boundary.
