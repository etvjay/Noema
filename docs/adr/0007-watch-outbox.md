# ADR 0007: Watch outbox

## Context

A state change and its notification must not silently diverge.

## Decision

Persist canonical state, semantic event, and outbox record in one transaction;
deliver with stable event IDs and idempotent retries.

## Consequences

Notification delivery can be retried without losing the causal event.

## Reopen condition

Reopen only if a durable workflow system provides an equivalent atomic
outbox/inbox guarantee.
