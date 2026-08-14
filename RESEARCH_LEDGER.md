# Noema research ledger

This ledger records the first-party source basis for implementation decisions.
Links are not evidence of a completed integration; runtime receipts and tests
are required before an E0 capability becomes demonstrated.

| Area | Source | Class | Decision |
| --- | --- | --- | --- |
| X Layer networks | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information | E2 | Testnet chain ID 1952 and mainnet chain ID 196 are explicit configuration inputs. |
| X Layer architecture | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer | E2 | Treat X Layer as EVM-compatible; verify current toolchain before deployment. |
| X Layer websockets | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/websockets-endpoints/websocket-endpoints | E2 | Reorg-aware and idempotent log processing is required. |
| RFC 8785 | https://www.rfc-editor.org/info/rfc8785 | E2 | Use JCS for canonical JSON before hashing. |
| viem | https://viem.sh/ | E2 | Use a typed EVM client with explicit X Layer chain definitions. |
| Foundry | https://www.getfoundry.sh/ | E2 | Forge is the contract build/test/deploy toolchain. |
| OpenAI API | https://developers.openai.com/api/docs | E2 | AI is a proposal-only layer and cannot write verified state. |
| MCP | https://modelcontextprotocol.io/specification/2026-07-28 | E2 | Streamable HTTP and current SDK conformance are required before claiming MCP support. |

## Evidence policy

Public URLs, source responses, contract receipts, hashes, signatures, and
deployment logs must be stored as inspectable artifacts when a capability is
claimed. A link in this file alone is not a deployment receipt.
