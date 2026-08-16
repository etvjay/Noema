# Phase 2 Live RWA Candidate Research Pack

Research date: 2026-08-16
Parent: #32
Owning issue: #34

## Research question

Which real tokenized U.S. Treasury / Treasury-fund representations create the strongest first release scenario for Noema's Evidence-Bounded Economic Object model?

The target trio must not be chosen because they share a ticker category or marketing description. It must expose materially different economic/legal claims, rights, restrictions, issuer structures, redemption mechanics, backing/portfolio structures, and representation relationships that Noema must resolve from evidence.

## Evidence standard

This screen uses current first-party/authoritative sources as the primary basis. Marketing language is not treated as sufficient economic authority where a more specific product/legal description exists. Final Phase 2 source capture (#35) must preserve immutable source snapshots and exact content hashes; this research file is selection evidence, not the canonical source snapshot layer.

## Candidate 1 — Franklin OnChain U.S. Government Money Fund / BENJI (FOBXX)

### Primary sources
- Franklin fund page: https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX
- Franklin Benji product page: https://digitalassets.franklintempleton.com/benji/
- Franklin peer-to-peer transfer announcement: https://www.franklintempleton.com/press-releases/news-room/2024/franklin-templeton-announces-availability-of-peer-to-peer-transfers-for-franklin-onchain-u.s.-government-money-fund

### Current research facts
- Product: Franklin OnChain U.S. Government Money Fund (FOBXX), a U.S.-registered money market fund.
- Identifier: CUSIP 35473R104; fund number/token branding BENJI.
- Economic representation: Franklin states that one share of FOBXX is represented by one BENJI token.
- Recordkeeping: the transfer agent maintains the official record of share ownership using Franklin's blockchain-integrated Benji platform and public blockchain networks for transaction activity.
- Portfolio rule: the fund invests at least 99.5% of assets in U.S. government securities, cash, and fully collateralized repurchase agreements.
- Fund aims to maintain a stable $1.00 share price.
- Peer-to-peer transfers between shareholders are supported through the public-blockchain recordkeeping system, subject to the product's investor/transfer controls.

### Semantic tension for Noema
BENJI is especially useful because the token is explicitly a representation of a registered mutual-fund share rather than a generic claim on an offchain pool. Noema must preserve the distinction between the blockchain representation and the underlying legal fund share while recognizing the explicit 1:1 representation relationship.

## Candidate 2 — Ondo Short-Term US Government Treasuries / OUSG

### Primary sources
- OUSG overview: https://docs.ondo.finance/qualified-access-products/ousg/overview
- Ondo trust/security structure: https://docs.ondo.finance/trust-and-security
- OUSG product page: https://ondo.finance/ousg

### Current research facts
- Issuer/fund: Ondo I LP, structured using a traditional GP/LP model.
- Economic representation: investors become limited partners by acquiring OUSG tokens, each representing a unitized limited partnership interest in the Fund.
- Regulatory structure: private fund under Section 3(c)(7) of the Investment Company Act; OUSG is restricted to qualifying investors under the applicable offering rules.
- Portfolio: OUSG provides exposure primarily to short-term U.S. Treasuries and GSE securities; the current documentation says the portfolio invests in funds issued by asset managers including BlackRock, Franklin Templeton, WisdomTree, Fidelity and others, plus bank deposits/USDC for liquidity, and may include direct Treasuries in the future.
- Transfer/mint/redeem: tokenized shares can be transferred 24/7; documented instant stablecoin mint/redemption functionality is subject to limits and eligibility/service-provider constraints.

### Semantic tension for Noema
OUSG is not simply 'a Treasury token.' The holder's legal position is a unitized limited-partnership interest in a private fund whose portfolio may itself hold multiple Treasury products/funds. That makes it a strong test of `CLAIM_ON`, `SHARE_CLASS_OF`, `BACKED_BY`/portfolio exposure, eligibility restrictions, and the difference between economic exposure and identity/equivalence.

## Candidate 3 — OpenEden TBILL

### Primary sources
- Product structure: https://docs.openeden.com/tbill/product-structuring
- Product introduction: https://docs.openeden.com/treasury-bills-vault/introduction
- FAQ: https://docs.openeden.com/tbill/faq
- Investor onboarding: https://docs.openeden.com/tbill/investor-onboarding
- Current product page: https://openeden.com/tbill

### Current research facts
- Token issuer: Treasury Bills Institutional Liquidity Limited, a BVI-regulated professional fund.
- Economic representation: TBILL is described as an EIP-20 representation of an investor's economic interest in the Fund.
- Legal right: holders have contractual rights to the redemption value of the Fund's net assets proportional to their TBILL holdings relative to outstanding supply.
- Portfolio: short-dated U.S. Treasury Bills plus a small USD allocation; current docs identify BNY Investment Management as investment manager and BNY as custodian.
- Token economics: token price is NAV per token and is expected to accrete with portfolio returns rather than remaining fixed at $1.
- Eligibility/transfer: permissioned onboarding/KYC; current product materials restrict access to eligible professional/accredited investors and transfers to whitelisted wallets.
- Redemption: redemption requests and available instant/onchain mechanics remain subject to the Fund's documented operational/eligibility rules.

### Semantic tension for Noema
TBILL provides direct Treasury-bill portfolio exposure through a BVI professional-fund claim, with NAV-accreting token economics and explicit pro-rata redemption-value rights. It should not be equated with BENJI or OUSG merely because all three expose short-duration U.S. government assets.

## Candidate 4 — Superstate USTB

### Primary sources
- Current USTB product page: https://superstate.com/ustb
- Current asset page: https://superstate.com/assets/ustb

### Current research facts
- Product: Short Duration US Government Securities Fund, a tokenized private fund.
- Structure: series of a Delaware Statutory Trust.
- Economic representation: ownership in the Fund is represented by USTB, held either as tokenized shares or book-entry shares.
- Portfolio: short-duration U.S. Treasury Bills.
- Custodian: Bank of New York Mellon.
- Transfer agent: Superstate Services LLC on current materials.
- Eligibility: current materials describe access for Accredited Investors and Qualified Purchasers in supported jurisdictions.
- Subscription/redemption: USD/USDC, with same-day/continuous mechanics described in current product materials, subject to liquidity and product restrictions.
- Network representations include Ethereum, Solana, Plume and book-entry ownership.

### Why it remains an alternate
USTB is a strong candidate, especially for comparing token representation vs book-entry shares and multiple technical representations of the same fund claim. For the first flagship trio, however, BENJI + OUSG + TBILL creates more legal/economic heterogeneity. USTB should be retained for a second scenario focused specifically on representation equivalence across networks/book-entry records.

## Candidate 5 — BlackRock USD Institutional Digital Liquidity Fund / BUIDL

### Primary sources
- Securitize launch announcement: https://investors.securitize.io/news/news-details/2024/BlackRock-Launches-Its-First-Tokenized-Fund-BUIDL-on-the-Ethereum-Network-03-20-2024/default.aspx
- Securitize BUIDL AUM/product update: https://investors.securitize.io/news/news-details/2025/BlackRock-USD-Institutional-Digital-Liquidity-Fund-BUIDL-Tokenized-By-Securitize-Surpasses-1B-in-AUM-03-13-2025/default.aspx
- BlackRock official token-address resource: https://www.blackrock.com/corporate/compliance/scams-and-fraud/resources
- 2026 OKX/BlackRock/Standard Chartered framework: https://investors.securitize.io/news/news-details/2026/OKX-BlackRock-and-Standard-Chartered-Launch-Joint-Framework-to-Establish-New-Utility-for-Tokenized-Real-World-Assets/default.aspx

### Current research facts
- Product: BlackRock USD Institutional Digital Liquidity Fund (BUIDL), BlackRock's tokenized institutional liquidity fund.
- Portfolio: cash, U.S. Treasury bills and repurchase agreements.
- Economic behavior: BUIDL seeks a stable value around $1 per token and distributes accrued yield/dividends onchain.
- Access: qualified investors through the Securitize infrastructure.
- Transfers: product materials describe near-real-time/24-7 peer-to-peer transfers among approved participants.
- Multiple public-chain representations/share classes exist; BlackRock publishes official token addresses for supported networks.

### Why it remains an alternate
BUIDL is highly relevant and should be retained for a subsequent share-class/cross-chain relationship scenario. For the first flagship trio, OUSG already creates a portfolio-of-funds/limited-partnership claim and BENJI/TBILL create cleaner contrast in fund-share and redemption-value structures. BUIDL can later stress `SHARE_CLASS_OF`, cross-chain technical representation, and transfer-agent semantics.

# Selected flagship trio

## 1. BENJI / FOBXX
Why selected: strongest explicit 'token represents one registered fund share' case and authoritative blockchain-integrated recordkeeping.

## 2. OUSG
Why selected: strongest private-fund/limited-partnership case; portfolio exposure may flow through other Treasury funds rather than a one-to-one claim on a specific Treasury security.

## 3. OpenEden TBILL
Why selected: strongest direct short-duration Treasury portfolio case with explicit pro-rata redemption-value rights, BVI professional-fund structure, whitelisted transfer restrictions, and NAV-accreting token price.

## Why this trio is better than a superficial market-cap trio

All three can be described colloquially as tokenized Treasury exposure. Their economic/legal structures are materially different:

| Dimension | BENJI / FOBXX | OUSG | OpenEden TBILL |
| --- | --- | --- | --- |
| Legal vehicle | U.S.-registered money market mutual fund | Delaware private LP / 3(c)(7) fund | BVI regulated professional fund |
| Token relationship | 1 BENJI represents 1 FOBXX share | token represents unitized limited-partnership interest | token represents economic interest / pro-rata redemption value |
| Portfolio | government securities, cash, fully collateralized repos | portfolio of Treasury/GSE products/funds + liquidity assets | short-dated U.S. T-Bills + small USD allocation |
| Value mechanics | aims at stable $1 share price; income distribution | fund share/NAV mechanics | NAV-per-token accretion |
| Eligibility | product-specific registered-fund/Benji eligibility | qualified/accredited institutional restrictions | professional/accredited + KYC/KYT whitelist |
| Transfer semantics | shareholder P2P supported through Benji rails | tokenized transfer subject to eligibility/product controls | whitelisted-wallet transfers only |

This means the expected top-level Noema result is **not pre-labelled equivalence**. The system must derive the relationship from captured evidence. The initial research hypothesis is that they are likely `SIMILAR_EXPOSURE_TO` at the broad Treasury-exposure level while remaining distinct economic objects/claims, but Phase 2 implementation must treat that as a hypothesis to test, not an expected fixture label.

# Handoff to #35

Capture immutable primary-source snapshots for the selected trio first. At minimum preserve:

- product/fund description and legal vehicle;
- current offering/eligibility restrictions;
- redemption/subscription terms;
- transfer restrictions;
- portfolio/backing/custody statements;
- explicit token/share/economic-interest relationship;
- official token/contract identifiers where available;
- relevant effective/publication date and source freshness;
- contradictory or changed source versions rather than silently selecting one.

Do not ingest this Markdown as canonical evidence in place of the primary sources. It is a research-selection record only.
