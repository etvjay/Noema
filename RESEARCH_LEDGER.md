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
| BENJI (Franklin Templeton OnChain U.S. Government Money Fund, FOBXX) | https://digitalassets.franklintempleton.com/benji/ ; https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX ; SEC EDGAR CIK 0001786958 series S000067043 ISIN US35473R1041 | E2 (first-party docs) | 1 share of FOBXX = 1 BENJI token; first U.S.-registered money market fund using a public blockchain as system of record; transfer agent keeps the official share register via the Benji platform; Rule 2a-7 "Government money market fund"; ~99.5%+ U.S. government securities/cash/repos; P2P transferable shares, intraday yield, daily onchain dividends; permissioned ERC-20; retail via Benji app on Stellar, institutional on Ethereum/Base/Polygon/Arbitrum/Avalanche/Aptos/Solana/BNB; custodian BNY Mellon; N-MFP3 monthly + N-CSR annual filings. |
| OUSG (Ondo Short-Term US Government Treasuries) | https://ondo.finance/ousg ; https://docs.ondo.finance/qualified-access-products/ousg/overview ; https://docs.ondo.finance/qualified-access-products/ousg/trust-and-transparency ; https://app.ondo.finance/legal-documentation/us | E2 (first-party docs) | OUSG is a tokenized fund interest in Ondo's Short-Term US Government Treasuries fund, a private-placement security under Rule 3(c)(7) (qualified purchasers only); 24/7 instant mints/redemptions; yield accrues into token price; KYC/AML whitelist enforced at the smart-contract level (non-whitelisted transfers revert); portfolio now holds fund shares (BlackRock BUIDL primary, plus BENJI, FYOXX, SWEEP) and USDC, not a direct SHV ETF; expenses capped at 0.15%; fund administrator NAV Consulting computes daily NAV independently; annual audits. |
| TBILL (OpenEden Treasury Bills Vault) | https://docs.openeden.com/tbill/introduction ; https://openeden.com/tbill ; https://app.openeden.com/tbill ; https://github.com/OpenEden-TBILL | E2 (first-party docs) | TBILL token is backed 1:1 by short-dated U.S. T-Bills (weighted-average maturity < 3 months) plus a small USD sleeve; token issuer is a BVI SIBA 2010 professional fund regulated by the BVI FSC; S&P Global rating AA+f/S1+; first tokenized US Treasury fund with Moody's "A-bf" fund rating; T-bills managed by BNY Investment Management and custodied by BNY in segregated accounts; whitelisted-only transfers per the Private Placement Memorandum; daily/monthly NAV statements by fund administrator (Protege Fund Services); mint via USDC; interest accrues into token value; ERC-20 on Ethereum plus Arbitrum and XRP Ledger. |

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

## Phase 2 live RWA candidate shortlist — 2026-08-20

Three candidates for the Phase 2 live release evidence capture (#35, feeds #36/#37/#64). All rows are E2 (first-party documentation) only; no observed-runtime capture has been performed yet. Mapping to the #57 validation profiles is structural and non-equivalent by design.

| Candidate | #57 profile (resolutionClass) | Required dimension mapping (evidence source basis) | Freshness / reporting |
| --- | --- | --- | --- |
| BENJI (FOBXX) | `profile:moneymarket-fund-share` (FUND_SHARE) | issuerIdentity (Franklin Templeton Trust, SEC CIK 0001786958), vehicleIdentity (FOBXX), shareClass (1 BENJI = 1 share), ownershipRights (transfer agent official record, P2P transferable), redemption (daily), eligibility (retail app / institutional), transferRestrictions (permissioned ERC-20, network gating), valuationNav (daily NAV), backingPortfolio (~99.5% U.S. gov securities + repos), custody (BNY Mellon), sourceAuthority (Benji Dev Hub + SEC EDGAR), freshness | N-MFP3 monthly, N-CSR annual, daily NAV; intraday yield |
| OUSG (Ondo Short-Term US Government Treasuries) | `profile:treasury-wrapped-representation` (WRAPPED_REPRESENTATION) | issuerIdentity (Ondo fund, Rule 3(c)(7) private placement), representationLineage (whitelisted ERC-20 on Ethereum 0x1B19...ee92, Polygon, Solana; token = fund interest), backingPortfolio (BUIDL/BENJI/FYOXX/SWEEP + USDC), custody (fund shares at underlying managers), sourceAuthority (Ondo docs + attestation reports), freshness (daily NAV) | Daily NAV by NAV Consulting (reports may lag up to 3 days); annual audits; monthly attestations |
| TBILL (OpenEden Treasury Bills Vault) | `profile:treasury-debt-instrument` (DEBT_INSTRUMENT) | issuerIdentity (BVI SIBA 2010 professional fund, BVI FSC), obligationTerms (short-dated zero-coupon U.S. T-Bills, WAM < 3 months), redemption (24/7 vault redemption to USDC), valuationNav (interest accrues into token price), backingPortfolio (1:1 T-Bills custodied by BNY in segregated accounts + small USD), custody (BNY), sourceAuthority (OpenEden docs), freshness (daily/monthly NAV statements) | Daily and monthly NAV by Protege Fund Services |

### Source contradictions and discrepancies

- **OUSG underlying holdings**: 2023 launch materials (e.g., Coinbase listing, 2023 Ondo blog) describe OUSG as holding the iShares Short Treasury Bond ETF (SHV) via BlackRock; current first-party Ondo materials (ondo.finance/ousg, 2026) and the 2024 audit README describe the portfolio holding fund shares (BUIDL primary, BENJI/FYOXX/SWEEP) plus USDC. Resolution: rely on current first-party Ondo documentation; treat SHV/ETF exposure descriptions as historical.
- **OUSG nomenclature**: some third-party pages call OUSG an "ETF"; Ondo first-party calls it a fund interest in "Ondo Short-Term US Government Treasuries". Resolution: tokenized fund interest, not a direct T-bill or an ETF.
- **TBILL rating**: OpenEden first-party states the TBILL Fund holds an S&P Global `AA+f/S1+` rating and a Moody's `A-bf` fund rating; a third-party aggregator (Portfi) lists "Not rated". Resolution: first-party issuer documentation outranks aggregator summaries.
- **BENJI token variants**: DefiLlama tracks BENJI plus iBENJI (Ethereum/BNB) and separately gBENJI/sgBENJI; the canonical 1-share mapping is the BENJI token on the primary deployments. Resolution: capture the BENJI deployment(s) that the fund's transfer agent recognizes as official share representation; do not merge variants.

## Evidence policy

Public URLs, source responses, contract receipts, hashes, signatures, and
deployment logs must be stored as inspectable artifacts when a capability is
claimed. A link in this file alone is not a deployment receipt.
