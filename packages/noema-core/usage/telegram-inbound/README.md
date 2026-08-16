# Telegram Inbound Boundary Usage

**Import:** `@noema/noema-core/telegram-inbound`
**Source:** `packages/noema-core/src/telegram-inbound.ts`

## Purpose

Inbound Telegram commands and evidence-intake boundary (#48). Lets users query and configure Noema from Telegram and submit candidate evidence — without allowing chat content to bypass canonical source/evidence admission. Telegram transport identity is provenance, never proof of economic truth.

## Public responsibilities

- `parseTelegramCommand(raw)` / `createInboundTelegramBoundary()` — deterministic parser mapping `/status`, `/compare`, `/why`, `/evidence`, `/representations`, `/attestations`, `/evaluate`, `/watch`, `/unwatch`, `/watches`, `/evidence-claim`, `/help` to canonical intents; everything else is rejected (`UNKNOWN_COMMAND`).
- `authorizeTelegramUser` — per-subscription/account authorization by allowed user/chat ids.
- `captureCandidateEvidence` — captures uploaded content as an immutable `CANDIDATE` (`noema-telegram-candidate-evidence-v1`) with explicit source authority, hashed body, and Telegram provenance.
- `admitCandidateToSourceSnapshot` — turns a captured candidate into an immutable `SourceSnapshot` via the caller's storage adapter, before any AI reasoning.
- `createInboundTelegramBoundary()` — assembled boundary with `isCommand`, `parse`, `authorize`, `captureEvidence`, `isCandidateEvidence`, `admitsOnlyAsCandidate`, `version`.

## Minimal example

```ts
import { createInboundTelegramBoundary } from "@noema/noema-core/telegram-inbound";

const boundary = createInboundTelegramBoundary();
const parsed = boundary.parse("/why decision:2");
const authorized = boundary.authorize({ identity, authorizedUserIds, authorizedChatIds });
const capture = boundary.captureEvidence({ /* uploaded file/URL */ });
// capture.status === "CANDIDATE"; admit via admitCandidateToSourceSnapshot + ingestSourceSnapshot
```

## Canonical semantics

- **Declared boundary.** Only allowlisted commands execute; natural language and unknown commands (`/approve`, `/transfer`) are rejected. No capability outside the boundary can be invoked.
- **Candidate-only admission.** Chat assertions become `CANDIDATE` evidence with `isFromChat: true` and must pass SourceSnapshot admission (`ingestSourceSnapshot`) — they can never directly create VERIFIED/ATTESTED state, equivalence, mandate outcomes, or object versions.
- **Idempotent updates.** Duplicate Telegram updates are deduplicated by update/message identity.
- **Authorization.** `authorizeTelegramUser` enforces per user/chat resource policy before any command executes.
- **Prompt-injection isolation.** Captured content is hashed as inert candidate data; hostile text never becomes model instructions (existing Noema AI hostile-evidence boundary applies downstream).
- **No secrets.** Parsed intents and captures never carry tokens, API keys, or chat credentials into model-visible context.

## Authority boundary

Telegram is a query/configuration and evidence-intake surface, never an authority. It cannot create VERIFIED state, equivalence, mandate outcomes, or versions. All inbound economic claims are candidates that require canonical verification through source/evidence admission.

## Proof

- `packages/noema-core/src/telegram-inbound.test.ts` — 9 unit tests (versioning, intent mapping, boundary rejection, malformed args, authorization, candidate capture, candidate-only admission, idempotency, no secrets).
- `tests/integrity/telegram-inbound.test.ts` — parity/boundary gate (7 tests): command mapping, SourceSnapshot candidate admission through `ingestSourceSnapshot`, per-resource authorization, no direct state creation, idempotency, prompt-injection capture, no secrets in intent context.
- QA gate `telegram-inbound` in `qa/noema-integrity.json`.