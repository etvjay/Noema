# Terminal Cross-Surface Gate (#54)

**Source:** `tests/integrity/terminal-cross-surface.test.ts`
**Artifact:** `artifacts/terminal/conformance-receipt.json` (`noema-terminal-conformance-v1`)

## Purpose

Ambient Intelligence terminal gate: proves that REST, SDK, MCP, webhook, Telegram, and UI expose the same canonical Noema state and semantic events for one correlated live-RWA watch/change scenario, and records a machine-readable conformance receipt.

## Required trace

```
canonical EconomicObject vN -> watch/subscription -> material change -> EconomicObject vN+1
-> VerificationReceipt -> DecisionReceipt -> SemanticEvent -> notification router
-> Telegram + webhook -> REST/SDK/MCP inspection
```

## What the gate proves

- **Exact release commit recorded** in the conformance receipt (`release.commit`).
- **Same `latest` object/version** returned by REST (`resolveLatestObject`), SDK (`objects.latest`), MCP (`resolve_object`/`get_object_version`), Telegram inspection (`/status`), and UI (`toNoemaUiViewModel`).
- **Exact-version immutability** across REST/SDK/MCP: `objects/<id>/versions/1` resolves identically on every surface.
- **Semantic drift-free fanout**: one canonical `MATERIAL_CHANGE` SemanticEvent routes to Telegram (`renderTelegramAlert`) and a signed webhook (`signWebhookEnvelope`/`verifyWebhookEnvelope`) with correlated eventId, correlationId, replayKey, receipt refs, objectRoot, evidenceRoot.
- **Retry identity**: webhook `envelopeIdempotencyKey` is stable per `eventId:deliveryId:attempt`; duplicate attempts do not create duplicate logical notifications.
- **`/why` grounding**: `explainMandateChange` output references the same canonical decision receipts, verification receipt, and event — it cannot contradict them.
- **Inbound Telegram admission**: `/evidence-claim` content becomes a `CANDIDATE` (`noema-telegram-candidate-evidence-v1`) admitted as `SourceSnapshot` then `DERIVED` evidence via `ingestSourceSnapshot` — it cannot create VERIFIED state or bypass verification.
- **Commitment consistency**: registry `objectRoot`/`evidenceRoot` match the verification receipt across versions.
- **No private-data leakage**: public economic-state surfaces exclude subscription identity (subscriptionId, telegramChatId, webhookUrl, secrets).
- **Machine-readable receipt**: every surface response is hashed (SHA-256) and recorded with correlation IDs; the artifact contains no secrets.

## Proof

- `tests/integrity/terminal-cross-surface.test.ts` — end-to-end cross-surface proof (1 test, full trace).
- `artifacts/terminal/conformance-receipt.json` — committed machine-readable receipt (`noema-terminal-conformance-v1`) with per-surface response hashes.
- QA gate `terminal-cross-surface` in `qa/noema-integrity.json`.
- Closure law: closes epic #44 only when this proof passes; #43 may cite this artifact.