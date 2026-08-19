# Terminal Convergence Protocol (noema-terminal-convergence-protocol-v1)

End-to-end proof that one multi-venue RWA economic object converges deterministically
across: venue/source observations -> SourceSnapshots -> Evidence -> scoped venue economic
attestations -> representation lineage -> Noema AI proposals -> deterministic promotion ->
EconomicObject vN -> asynchronous venue changes -> finality/scope validation -> vN+1 or
explicit conflict/no-op -> VerificationReceipt -> Mandate reevaluation -> SemanticEvent ->
X Layer commitment/attestation history.

## Fixture
- noema-terminal-convergence-v1, frozen at 2026-08-19T18:00:00Z
- object object:rwa:treasury-fund
- venues: issuer, fund-admin, oracle, chain-observer (distinct observation times)
- non-happy-paths: late NAV (temporal skew), duplicate/no-op redelivery, reorged chain
  observation, revoked attestation

## Trace
See raw-trace.json for the full machine-readable trace and result.json for the verdict.
