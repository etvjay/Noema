# Noema research ledger

This ledger records the first-party source basis for implementation decisions.
Links are not evidence of a completed integration; runtime receipts and tests
are required before an E0 capability becomes demonstrated.

| Area | Source | Class | Decision |
| --- | --- | --- | --- |
| X Layer networks | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information | E2 | Testnet chain ID 1952 and mainnet chain ID 196 are explicit configuration inputs. |
| X Layer architecture | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer | E2 | Treat X Layer as EVM-compatible; verify current toolchain before deployment. |
| X Layer websockets | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/websockets-endpoints/websocket-endpoints | E2 | Reorg-aware and idempotent log processing is required. |
| X Layer OKLink verification | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/verify-a-smart-contract/verify-with-foundry | E2 + observed runtime | Current credential-free Foundry verifier route was exercised successfully against NoemaRegistry on testnet: submission `ok`, then `Pending in queue` -> `Pass - Verified`; run `31944788775`, artifact `9262980443`. |
| X Layer Builder Codes | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/integration | E2 + contradiction observed | The integration guide describes testnet `registerAuto`, but the live current testnet registry at `0x33907e98d7392d95212b05ab03f091e02d7815bf` reports `Builder Codes` / `BUILDERCODE`, the Noema signer owns 0 codes, and `registerAuto()` reverts in simulation. Do not send another registration transaction without new first-party/runtime evidence. |
| X Layer Builder Code registration UX | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/overview | E2 | Current overview directs application developers through the OKX developer portal. Treat portal/account registration as the current prerequisite when direct `registerAuto` is unavailable. |
| RFC 8785 | https://www.rfc-editor.org/info/rfc8785 | E2 | Use JCS for canonical JSON before hashing. |
| viem | https://viem.sh/ | E2 | Use a typed EVM client with explicit X Layer chain definitions. |
| Foundry | https://www.getfoundry.sh/ | E2 | Forge is the contract build/test/deploy toolchain. |
| OpenAI API | https://developers.openai.com/api/docs | E2 | AI is a proposal-only layer and cannot write verified state. |
| MCP | https://modelcontextprotocol.io/specification/2026-07-28 | E2 | Streamable HTTP and current SDK conformance are required before claiming MCP support. |
| X Layer EAS predeploys (testnet 1952) | observed runtime (live `eth_getCode` probe, no vendor claim) | observed runtime | EAS (`0x4200000000000000000000000000000000000021`) and SchemaRegistry (`0x4200000000000000000000000000000000000020`) OP-Stack predeploys are present with code (2059 bytes each); versions read back `1.4.1-beta.3` / `1.3.1-beta.2`. These are operator-deployed genuine EAS code, not evidence of EAS-org-supported X Layer integration. |
| EAS deployment registry | https://docs.attest.sh/docs/deployments--addresses (EAS org) | E2 | X Layer is **not** listed in the EAS official deployment registry. Do not adopt EAS by assumption for X Layer; treat predeploy presence as operator-deployed code until EAS-org support is demonstrated. |
| X Layer attestation transport cost | measurement harness `tools/attestation-transport-measurement.mjs` (EIP-2028 + live gas price, no broadcast) | observed runtime (offline measurement) | Registry `registerObject`/`attestClaim` and envelope anchor/revoke are 100 calldata bytes (~1600 calldata gas); EAS `registerSchema` is 229 bytes and `attest` 292 bytes. EAS offers no calldata/cost advantage; adopted transport is native registry commitment + signed envelope anchoring (ADR 0010, experiment `noema-xlayer-attestation-transport`). |

## Runtime contradiction register

### Builder Code testnet registration — 2026-08-16

First-party documentation currently exposes two different operational stories:

1. the Builder Code integration guide describes calling `registerAuto()` on testnet;
2. the current Builder Code overview directs application developers through the OKX developer portal.

Noema probed the documented testnet registry using the funded X Layer signer. The contract had bytecode, identified itself as `Builder Codes` / `BUILDERCODE`, the signer held zero Builder Code NFTs, and both typed and raw `eth_call` simulation of `registerAuto()` reverted. The earlier transaction attempt therefore failed during gas estimation before broadcast and spent no registration gas.

Evidence:

- workflow run: `31944769912`
- artifact: `9262973817`
- artifact SHA-256: `e6ee474ce8a7b5a413bb62879df8163dc4abb338a1220ac4952e9e0612030b1b`

Resolution: observed runtime behavior outranks an unexecuted documentation path. Do not claim direct testnet Builder Code registration works for Noema until a new first-party route or successful runtime receipt supersedes this observation.

### OKLink source verification — 2026-08-16

Older/API-oriented documentation can imply API credentials are required. The current Foundry route was tested directly against the deployed NoemaRegistry and completed without an API key.

Observed sequence:

`submission ok -> Pending in queue -> Pass - Verified`

Evidence:

- registry: `0xBa76F97969000D632cF33B87afb4d853C52d1C03`
- workflow run: `31944788775`
- artifact: `9262980443`
- artifact SHA-256: `0f631755257c27fc05d1fa3260c3a0eaf09a446129e02ccb82d2555b17503c47`

Resolution: credential-free Foundry verification is demonstrated for this deployed X Layer testnet contract. This does not imply every OKLink API endpoint is unauthenticated.

## Evidence policy

Public URLs, source responses, contract receipts, hashes, signatures, and
deployment logs must be stored as inspectable artifacts when a capability is
claimed. A link in this file alone is not a deployment receipt.
