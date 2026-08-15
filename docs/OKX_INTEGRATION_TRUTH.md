# Noema — OKX / X Layer Integration Truth

Status: research-backed implementation guidance; not deployment proof.

This document applies Research Foundry evidence discipline and Product Foundry scope discipline to Noema's OKX/X Layer integration. Product Truth remains authoritative for product semantics. Current official implementation truth wins when external APIs, chain architecture, or tooling have changed.

## Epistemic labels

- `E2`: sourced technical feasibility from current first-party documentation or official repositories.
- `E1`: proposed Noema design decision derived from E2 evidence, not yet proven end-to-end.
- `E0`: unverified implementation until live tests, transactions, receipts, or deployment artifacts exist.

## Current X Layer truth

### Architecture — E2

Current X Layer documentation describes X Layer as an EVM-equivalent Ethereum L2 built on an enhanced Optimism OP Stack, with an OP Stack + AggLayer architecture.

Engineering consequence — E1:

- Preserve Noema's EVM contract design.
- Do not rely on legacy X Layer / Polygon-zkEVM-era architectural assumptions.
- Treat current OP Stack RPC/finality/event behavior as the deployment baseline.

### Networks — E2

- Mainnet chain ID: `196`
- Testnet chain ID: `1952`
- Native gas token: `OKB`
- Mainnet RPC: `https://rpc.xlayer.tech` or `https://xlayerrpc.okx.com`
- Testnet RPC: `https://testrpc.xlayer.tech/terigon` or `https://xlayertestrpc.okx.com/terigon`

Noema consequence — E1:

Use X Layer testnet for reproducible registry deployment and end-to-end proof before mainnet claims.

## Contract and client tooling

### Foundry — E2 / selected Noema tool

The Noema repository already uses Foundry. Continue using Forge for contract build, tests, deployment scripts, and deployment receipts rather than introducing Hardhat without a concrete requirement.

### Viem + Builder Codes — E2

Current X Layer Builder Code integration uses ERC-8021 attribution and requires Viem `2.45.0` or later for the documented client path. The documented implementation uses `ox/erc8021` to generate a `dataSuffix` and sends it through the wallet/client that submits the transaction.

Noema consequence — E1:

- Add Builder Code attribution only to the transaction-sending client used for Noema registry commitments.
- Attribution is metadata/analytics, not EconomicObject evidence or economic identity.
- Do not allow attribution suffixes to alter canonical object/evidence roots.

## Onchain OS

### Current official skills — E2

The official `okx/onchainos-skills` repository provides current skills for Agentic Wallet, read-only DEX/market intelligence, payments, DeFi, OKX.AI, DApp discovery, and related agent workflows. The CLI can also run as an MCP server.

The latest stable GitHub release verified on 2026-08-15 is `v4.4.10`, published 2026-08-11.

### RWA discovery / market evidence — E2

Current Onchain OS Market / Token API includes an RWA token-list capability and, as of the June 23, 2026 changelog, support for querying RWA stock tokens.

Noema consequence — E1:

Use Onchain OS RWA/token/market APIs as `REFERENCE_DATA` or `MARKET_DATA` for discovery and observations. They must not by themselves establish legal rights, issuer identity, share-class identity, redemption terms, reserves, custody, or economic equivalence.

### Agentic Wallet — E2

Current Agentic Wallet documentation describes TEE-protected key generation/storage and transaction risk checks.

Noema consequence — E1:

Agentic Wallet is optional for operator/demo/agent transaction submission. It is not required to define Noema's semantic kernel and must not turn Noema into an autonomous executor.

### Trade / swap / DeFi execution — E2 capability, OUTSIDE MVP

Onchain OS exposes swap, transaction broadcasting, DeFi, and execution workflows.

Product Foundry boundary:

Noema assesses financeability and publishes evidence-bounded decisions. Direct trading, routing, deposits, swaps, or autonomous capital execution remain downstream integrations and are not MVP dependencies.

## Chainlink Data Streams on X Layer

### Availability — E2

OKX announced Chainlink Data Streams on X Layer mainnet for high-frequency market data, including 24/5 equities, tokenized treasury pricing, and commodities.

Noema consequence — E1:

Use Data Streams, when an appropriate stream is actually available to the developer account, as market/freshness evidence only. A price stream is not proof of legal identity, reserves, custody, redemption rights, share-class equivalence, or issuer authority.

Never hardcode a feed/stream identifier from marketing material. Enumerate current supported streams from the actual Chainlink developer surface and preserve the returned identifier/version in evidence.

## X Layer Data API

### Capability — E2

Current X Layer Data API exposes blocks, transactions, addresses, tokens, event logs, and contract verification.

Noema consequence — E1

Use it as a useful inspection/indexing surface for X Layer commitments and demo traceability. The canonical deployment/commit proof should still preserve the signed transaction, transaction hash, receipt, block reference, emitted event, chain ID, contract address, and roots.

## Product Foundry integration rule

Integrate only capabilities that strengthen the Noema golden path:

`Resolve → Evidence → Verify → Interpret → Evaluate → Commit → Watch → Re-evaluate → Notify`

Accepted MVP roles:

1. **Onchain OS Market/RWA APIs** — candidate discovery and market/reference evidence.
2. **Issuer/primary sources** — decisive asset-specific rights and authority evidence.
3. **Chainlink Data Streams** — market observations/freshness where a relevant stream is available.
4. **Foundry** — registry contract test/deploy tooling.
5. **Viem + ERC-8021 Builder Code** — attributed transaction submission where appropriate.
6. **X Layer RPC + Data API** — commitment, receipt/event observation, and inspection.
7. **Onchain OS CLI/MCP** — optional developer/agent interoperability surface, not a replacement for Noema's own REST/SDK/MCP contracts.

Rejected as core MVP dependencies:

- OKX DEX swaps/trading
- OKX DeFi deposit/withdraw execution
- autonomous Agentic Wallet capital actions
- unrelated OKX.AI marketplace features
- integration-count optimization for judging optics

## Research Foundry contradiction register

| Claim | Earlier assumption | Current evidence | Resolution |
| --- | --- | --- | --- |
| X Layer execution architecture | Legacy/unspecified X Layer architecture may be assumed | Current official docs describe enhanced OP Stack + AggLayer mode | Implement and test against current OP Stack X Layer behavior; preserve Noema semantics |
| Onchain OS skill version | Older web-indexed release may appear current | Official GitHub latest stable verified as `v4.4.10` on 2026-08-15 | Pin/install current stable or deliberately tested version; record exact version in receipts |
| OKX RWA API support | Generic token/market discovery only | Current Token API and changelog include RWA token querying | Add as discovery/reference source, not decisive economic authority |

## Proof required before capability promotion

A capability remains `E0` until Noema has appropriate runtime evidence. At minimum:

- API adapter: captured request/response fixture with timestamp, source, authority class, and failure behavior.
- Chain deployment: contract address, chain ID, tx hash, receipt, block, bytecode/verification artifact.
- Builder Code: attributed test transaction and verification evidence.
- Data Stream: actual stream identifier, fetched report, timestamp, verification path, and mapping to a Noema Evidence record.
- Onchain OS skill/CLI: exact installed version plus a successful live/sandbox invocation receipt.
