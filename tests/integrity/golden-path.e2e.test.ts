import { describe, expect, it } from "vitest";
import type {
  EconomicObject,
  Mandate,
  SourceSnapshot
} from "@noema/economic-kernel";
import {
  reduceEconomicObject,
  validateEconomicObjectLineage
} from "@noema/noema-core";
import {
  registerRegistryCommitment,
  updateRegistryCommitment
} from "@noema/noema-core/commitment";
import { evaluateMandate } from "@noema/noema-core/mandate";
import { resolveSemanticRelationship } from "@noema/noema-core/semantic";
import {
  initializeWatchState,
  processWatchedChange
} from "@noema/noema-core/watch";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;

function resolveCandidate(id: string): EconomicObject {
  const base = makeEconomicObject();
  const baseClaim = base.claims[0]!;
  const baseEvidence = base.evidence[0]!;
  const claim = {
    ...baseClaim,
    id: `claim:${id}:identity`,
    subject: id,
    sourceRefs: [`source:${id}:primary`],
    evidenceRefs: [`evidence:${id}:primary`]
  };
  const evidence = {
    ...baseEvidence,
    id: `evidence:${id}:primary`,
    source: `source:${id}:primary`
  };
  const representationId = `representation:${id}:primary`;
  const relationshipId = `relationship:${id}:represents`;

  return reduceEconomicObject({
    id,
    version: 1,
    classification: {
      ...base.classification,
      claimRef: claim.id
    },
    identifiers: base.identifiers.map((identifier) => ({
      ...identifier,
      value: id,
      source: evidence.source
    })),
    representations: [
      {
        ...base.representations[0]!,
        id: representationId,
        relationshipToObject: relationshipId,
        evidence: [evidence.id]
      }
    ],
    relationships: [
      {
        ...base.relationships[0]!,
        id: relationshipId,
        subject: representationId,
        object: id,
        evidence: [evidence.id]
      }
    ],
    parties: [],
    rights: [],
    obligations: [],
    restrictions: [],
    economics: {
      ...base.economics,
      claimRefs: [claim.id]
    },
    claims: [claim],
    evidence: [evidence],
    attestations: [],
    exceptions: [],
    provenance: {
      edges: [
        {
          id: `edge:${id}:claim-evidence`,
          from: claim.id,
          to: evidence.id,
          relation: "SUPPORTED_BY"
        }
      ]
    },
    createdAt: base.createdAt,
    updatedAt: base.updatedAt
  });
}

function sourceSnapshot(object: EconomicObject): SourceSnapshot {
  const evidence = object.evidence[0]!;
  return {
    id: evidence.source,
    sourceId: `issuer:${object.id}`,
    uri: `https://issuer.example/${encodeURIComponent(object.id)}.json`,
    contentType: "application/json",
    contentHash: evidence.contentHash,
    fetchedAt: evidence.fetchedAt,
    httpStatus: 200,
    bodyStorageRef: `storage:${object.id}:primary`
  };
}

function treasuryMandate(): Mandate {
  return {
    id: "mandate:golden:treasury",
    version: 1,
    principal: "treasury:golden",
    objective: "Hold fresh verified tokenized Treasury exposure",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: [],
    jurisdictions: [],
    requiredClaims: [
      { property: "economicIdentity", requiredState: "SOURCED" }
    ],
    requiredEvidence: [
      { type: "API_RESPONSE", maxAgeMs: 3_600_000 }
    ],
    maxEvidenceAgeMs: 3_600_000
  };
}

describe("Noema complete golden path", () => {
  it("proves resolve -> evidence -> verify -> interpret -> evaluate -> commit -> watch -> re-evaluate -> notify", () => {
    const candidates = [
      resolveCandidate("object:golden:a"),
      resolveCandidate("object:golden:b"),
      resolveCandidate("object:golden:c")
    ];
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.status === "RESOLVED")).toBe(true);

    const selected = candidates[0]!;
    const evidence = selected.evidence[0]!;
    const claim = selected.claims[0]!;
    const source = sourceSnapshot(selected);
    const initialLineage = validateEconomicObjectLineage(selected, [source]);
    expect(initialLineage.valid).toBe(true);
    expect(initialLineage.traces[0]?.paths[0]?.contentHash).toBe(evidence.contentHash);
    expect(initialLineage.traces[0]?.paths[0]?.sourceSnapshotId).toBe(source.id);

    const semantic = resolveSemanticRelationship({
      left: {
        id: selected.representations[0]!.id,
        economicClaim: claim.id,
        issuerClaim: "issuer:golden",
        shareClass: "class-a",
        exposureClass: "US_TREASURY_BILL",
        rights: ["BENEFICIAL_INTEREST", "REDEMPTION"],
        restrictions: ["ELIGIBLE_INVESTORS_ONLY"],
        backing: ["UST-BILL-POOL-GOLDEN"],
        redemption: { asset: "USD", windowMs: 86_400_000 },
        evidenceFreshness: "FRESH"
      },
      right: {
        id: "representation:golden:bridged",
        economicClaim: claim.id,
        issuerClaim: "issuer:golden",
        shareClass: "class-a",
        exposureClass: "US_TREASURY_BILL",
        rights: ["REDEMPTION", "BENEFICIAL_INTEREST"],
        restrictions: ["ELIGIBLE_INVESTORS_ONLY"],
        backing: ["UST-BILL-POOL-GOLDEN"],
        redemption: { asset: "USD", windowMs: 86_400_000 },
        evidenceFreshness: "FRESH"
      },
      links: [
        {
          from: "representation:golden:bridged",
          to: selected.representations[0]!.id,
          type: "BRIDGED_REPRESENTATION_OF"
        }
      ]
    });
    expect(semantic.relationship).toBe("ECONOMICALLY_EQUIVALENT_TO");

    const interpreted = reduceEconomicObject({
      id: selected.id,
      version: selected.version,
      classification: selected.classification,
      identifiers: selected.identifiers,
      representations: [
        ...selected.representations,
        {
          id: "representation:golden:bridged",
          environment: "EVM",
          network: "xlayer-testnet",
          contract: "0x0000000000000000000000000000000000000abc",
          tokenStandard: "ERC-20",
          identifiers: [],
          relationshipToObject: "relationship:golden:equivalent",
          status: "ACTIVE",
          evidence: [evidence.id]
        }
      ],
      relationships: [
        ...selected.relationships,
        {
          id: "relationship:golden:equivalent",
          subject: "representation:golden:bridged",
          predicate: semantic.relationship!,
          object: selected.representations[0]!.id,
          state: "SOURCED",
          evidence: [evidence.id],
          attestations: []
        }
      ],
      parties: selected.parties,
      rights: selected.rights,
      obligations: selected.obligations,
      restrictions: selected.restrictions,
      economics: selected.economics,
      claims: selected.claims,
      evidence: selected.evidence,
      attestations: selected.attestations,
      exceptions: selected.exceptions,
      provenance: selected.provenance,
      createdAt: selected.createdAt,
      updatedAt: selected.updatedAt
    });

    const mandate = treasuryMandate();
    const verification = verifyEconomicObject(interpreted, {
      nowMs: NOW,
      maxEvidenceAgeMs: mandate.maxEvidenceAgeMs
    });
    const decision = evaluateMandate(interpreted, verification, mandate, { nowMs: NOW });
    const replayDecision = evaluateMandate(interpreted, verification, mandate, { nowMs: NOW });
    expect(verification.overallStatus).toBe("PASS");
    expect(decision.decision).toBe("ALLOW");
    expect(replayDecision).toEqual(decision);

    let registry = registerRegistryCommitment({
      objectId: interpreted.id,
      objectRoot: verification.objectRoot,
      evidenceRoot: verification.evidenceRoot
    });
    expect(registry.events[0]).toEqual({
      type: "ObjectRegistered",
      objectId: interpreted.id,
      version: 1,
      objectRoot: verification.objectRoot,
      evidenceRoot: verification.evidenceRoot
    });

    const historicalV1 = JSON.stringify(interpreted);
    const staleCandidate = reduceEconomicObject({
      id: interpreted.id,
      version: interpreted.version,
      classification: interpreted.classification,
      identifiers: interpreted.identifiers,
      representations: interpreted.representations,
      relationships: interpreted.relationships,
      parties: interpreted.parties,
      rights: interpreted.rights,
      obligations: interpreted.obligations,
      restrictions: interpreted.restrictions,
      economics: interpreted.economics,
      claims: [{ ...claim, state: "STALE" }],
      evidence: [{ ...evidence, freshness: "STALE" }],
      attestations: interpreted.attestations,
      exceptions: [
        {
          id: "exception:golden:stale",
          objectId: interpreted.id,
          type: "EVIDENCE_STALE",
          severity: "BLOCKING",
          affectedClaims: [claim.id],
          evidence: [evidence.id],
          detectedAt: NOW + 1_000,
          status: "OPEN"
        }
      ],
      provenance: interpreted.provenance,
      createdAt: interpreted.createdAt,
      updatedAt: NOW + 1_000
    });

    const watchState = initializeWatchState(interpreted);
    const changed = processWatchedChange({
      state: watchState,
      watch: {
        id: "watch:golden",
        objectId: interpreted.id,
        mandateId: mandate.id,
        webhookUrl: "https://notify.example/golden",
        discordChannel: "discord:golden"
      },
      candidate: staleCandidate,
      changeId: "change:golden:stale",
      previousVerification: verification,
      previousDecision: decision,
      nowMs: NOW + 1_000,
      evaluate: (object) => {
        const nextVerification = verifyEconomicObject(object, {
          nowMs: NOW + 1_000,
          maxEvidenceAgeMs: mandate.maxEvidenceAgeMs
        });
        return {
          verification: nextVerification,
          decision: evaluateMandate(object, nextVerification, mandate, {
            nowMs: NOW + 1_000
          })
        };
      }
    });

    expect(changed.result.object.version).toBe(2);
    expect(changed.result.verification.overallStatus).toBe("FAIL");
    expect(changed.result.decision.decision).toBe("BLOCK");
    expect(JSON.stringify(changed.state.history[0]!.object)).toBe(historicalV1);
    expect(changed.result.event?.oldVersion).toBe(1);
    expect(changed.result.event?.newVersion).toBe(2);
    expect(changed.result.event?.oldDecisionRef).toBe(decision.id);
    expect(changed.result.event?.newDecisionRef).toBe(changed.result.decision.id);
    expect(changed.result.notifications.map((item) => item.channel).sort()).toEqual([
      "DISCORD",
      "WEBHOOK"
    ]);

    registry = updateRegistryCommitment(registry, {
      objectId: interpreted.id,
      expectedVersion: 1,
      objectRoot: changed.result.verification.objectRoot,
      evidenceRoot: changed.result.verification.evidenceRoot
    });
    expect(registry.commitments).toHaveLength(2);
    expect(registry.commitments[0]!.version).toBe(1);
    expect(registry.commitments[1]!.version).toBe(2);
    expect(registry.events[1]).toEqual({
      type: "ObjectUpdated",
      objectId: interpreted.id,
      previousVersion: 1,
      newVersion: 2,
      objectRoot: changed.result.verification.objectRoot,
      evidenceRoot: changed.result.verification.evidenceRoot
    });

    expect(decision.supportingClaims).toContain(claim.id);
    expect(initialLineage.traces[0]?.claimId).toBe(claim.id);
    expect(initialLineage.traces[0]?.paths[0]?.evidenceId).toBe(evidence.id);
    expect(initialLineage.traces[0]?.paths[0]?.sourceSnapshotId).toBe(source.id);
    expect(initialLineage.traces[0]?.paths[0]?.contentHash).toBe(evidence.contentHash);
    expect(registry.commitments[0]!.objectRoot).toBe(verification.objectRoot);
    expect(registry.commitments[0]!.evidenceRoot).toBe(verification.evidenceRoot);

    const retry = processWatchedChange({
      state: changed.state,
      watch: {
        id: "watch:golden",
        objectId: interpreted.id,
        mandateId: mandate.id,
        webhookUrl: "https://notify.example/golden",
        discordChannel: "discord:golden"
      },
      candidate: staleCandidate,
      changeId: "change:golden:stale",
      previousVerification: verification,
      previousDecision: decision,
      nowMs: NOW + 1_000,
      evaluate: () => {
        throw new Error("idempotent replay must not re-evaluate");
      }
    });
    expect(retry.result).toEqual(changed.result);
    expect(retry.state.history).toHaveLength(2);
  });
});
