import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomicObject, Mandate, SourceSnapshot } from "@noema/economic-kernel";
import { validateEconomicObjectLineage } from "@noema/noema-core";
import {
  ingestSourceSnapshot,
  type SourceIngestionSuccess
} from "@noema/noema-core/evidence";
import { deriveVenueAttestationId } from "@noema/noema-core/attestation";
import { synchronizeEconomicObject } from "@noema/noema-core/synchronizer";
import type { VenueDelivery } from "@noema/noema-core/synchronizer";
import { evaluateMandate } from "@noema/noema-core/mandate";
import {
  registerRegistryCommitment,
  updateRegistryCommitment
} from "@noema/noema-core/commitment";
import {
  initializeWatchState,
  processWatchedChange
} from "@noema/noema-core/watch";
import {
  traceRepresentationLineage,
  validateRepresentationEvidence
} from "@noema/noema-core/representation";
import { resolveSemanticRelationship } from "@noema/noema-core/semantic";
import { verifyEconomicObject } from "@noema/verification";
import { hashNoemaAiProposal } from "@noema/schemas/ai";
import {
  reduceAiProposalPromotion,
  applyAcceptedAiProposal
} from "../../packages/noema-ai/src/promotion.js";
import {
  transportARegister,
  transportAAttest,
  transportARevoke,
  transportBAnchor,
  transportCSchemaRegister,
  gasFor
} from "../../tools/attestation-transport-core.mjs";
import { main } from "../../apps/cli/src/index";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FIXTURE_PATH = resolve(REPO_ROOT, "fixtures/terminal/terminal-rwa-v1.json");
const SCENARIO_V1 = resolve(REPO_ROOT, "fixtures/terminal/scenario/scenario-v1.json");
const SCENARIO_LATE = resolve(REPO_ROOT, "fixtures/terminal/scenario/scenario-v2-late.json");
const STATE_DIR = resolve(REPO_ROOT, "experiments/state/noema-terminal-convergence");
const BUNDLE_DIR = resolve(REPO_ROOT, "artifacts/terminal/noema-terminal-convergence");

type Fixture = {
  fixtureVersion: string;
  frozenAt: string;
  protocolVersion: string;
  object: EconomicObject;
  snapshots: SourceSnapshot[];
  representations: unknown[];
  mandate: Mandate;
  aiProposal: Record<string, unknown>;
  phases: Record<string, VenueDelivery[]>;
  policy: {
    venueCapabilities: Record<string, string>;
    trustedAttestors: string[];
    nowMs: number;
    maxEvidenceAgeMs: number;
    lateEvidenceThresholdMs: number;
    requireFinalizedObservations: boolean;
  };
};

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

type SynchronizePolicy = Parameters<typeof synchronizeEconomicObject>[0]["policy"];

function policy(): SynchronizePolicy {
  return {
    venueCapabilities: fixture.policy.venueCapabilities as SynchronizePolicy["venueCapabilities"],
    trustedAttestors: new Set(fixture.policy.trustedAttestors),
    nowMs: fixture.policy.nowMs,
    maxEvidenceAgeMs: fixture.policy.maxEvidenceAgeMs,
    lateEvidenceThresholdMs: fixture.policy.lateEvidenceThresholdMs,
    requireFinalizedObservations: fixture.policy.requireFinalizedObservations
  };
}

function mandate() {
  return fixture.mandate;
}

function verifyAt(object: EconomicObject, nowMs: number) {
  return verifyEconomicObject(object, {
    nowMs,
    maxEvidenceAgeMs: fixture.policy.maxEvidenceAgeMs
  });
}

function b32(utf8: string): `0x${string}` {
  return `0x${createHash("sha256").update(utf8, "utf8").digest("hex")}`;
}

function replayDetails(stdout: string): { code: number; details: Record<string, unknown> } {
  return JSON.parse(stdout);
}

async function capture(args: string[]): Promise<{ code: number; text: string }> {
  let stdout = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalError = process.stderr.write.bind(process.stderr);
  const originalArgs = process.argv;
  process.argv = ["node", "noema", ...args];
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const code = await main(args);
    return { code, text: stdout };
  } finally {
    process.stdout.write = originalWrite;
    process.stderr.write = originalError;
    process.argv = originalArgs;
  }
}

const NAV_CLAIM_ID = "claim:object:rwa:treasury-fund:object:rwa:treasury-fund:NAV:venue:fund-admin";
const LATE_NAV_ATTESTATION_ID = "attestation:venue-fund-admin:NAV:2";

describe("noema terminal convergence gate (#65)", () => {
  it("proves one multi-venue RWA object end to end across the full trace", () => {
    const nowMs = fixture.policy.nowMs;

    // ---- Source snapshot ingestion: SourceSnapshots -> Evidence ----
    const ingestions = fixture.snapshots.map((snapshot) =>
      ingestSourceSnapshot({
        snapshot,
        evidenceId: `evidence:ingested:${snapshot.id}`,
        type: snapshot.id === "source:chain-observer" ? "ONCHAIN_STATE" : "API_RESPONSE",
        authority: snapshot.id === "source:chain-observer" ? "ONCHAIN_STATE" : "PRIMARY_SOURCE",
        observedAt: snapshot.fetchedAt,
        nowMs,
        maxAgeMs: fixture.policy.maxEvidenceAgeMs
      })
    );
    const ingested = ingestions.filter(
      (result): result is SourceIngestionSuccess => result.status !== "SOURCE_FAILURE"
    );
    expect(ingested).toHaveLength(fixture.snapshots.length);
    const ingestedContentHashes = new Set(
      ingested.map((result) => result.evidence.contentHash)
    );
    expect(ingestedContentHashes.has(fixture.object.evidence[1]!.contentHash)).toBe(true);

    // ---- Base object lineage: claims -> evidence -> snapshots ----
    const baseLineage = validateEconomicObjectLineage(fixture.object, fixture.snapshots);
    expect(baseLineage.valid).toBe(true);
    expect(baseLineage.traces).toHaveLength(fixture.object.claims.length);
    expect(baseLineage.issues).toEqual([]);

    // ---- Representation lineage: evidence-derived, no ticker/name basis ----
    const lineageTrace = traceRepresentationLineage(
      fixture.representations as Parameters<typeof traceRepresentationLineage>[0]
    );
    expect(lineageTrace.cycles).toEqual([]);
    expect(lineageTrace.ambiguous).toEqual([]);
    expect(lineageTrace.edges.some((edge) => edge.kind === "WRAPPED_REPRESENTATION_OF")).toBe(true);
    for (const edge of lineageTrace.edges) {
      expect(edge.evidenceRefs.length).toBeGreaterThan(0);
    }

    const wrapperEvidence = fixture.object.evidence.filter((evidence) =>
      ["evidence:rwa:onchain", "evidence:rwa:issuance"].includes(evidence.id)
    );
    const wrapperValid = validateRepresentationEvidence(
      "WRAPPED_REPRESENTATION_OF",
      wrapperEvidence,
      ["lineageEvidence", "onchainState"],
      { wrapperLineage: true }
    );
    expect(wrapperValid.valid).toBe(true);
    expect(wrapperValid.reasonCodes).toEqual(["EVIDENCE_SUFFICIENT"]);

    const forbiddenBasis = validateRepresentationEvidence(
      "WRAPPED_REPRESENTATION_OF",
      wrapperEvidence,
      ["sameTicker"],
      { wrapperLineage: true }
    );
    expect(forbiddenBasis.valid).toBe(false);
    expect(forbiddenBasis.reasonCodes).toEqual(["FORBIDDEN_BASIS:sameTicker"]);

    // ---- v1: register the base economic object (version 1) ----
    const v1Verification = verifyAt(fixture.object, nowMs);
    expect(v1Verification.overallStatus).toBe("PASS");
    // A lone base object is not yet action-authoritative: no venue-attested claims.
    const v1Decision = evaluateMandate(fixture.object, v1Verification, mandate(), { nowMs });
    expect(v1Decision.decision).toBe("BLOCK");
    expect(
      v1Decision.policyChecks.some(
        (check) => check.ruleId === "mandate:claim:NAV:ATTESTED" && check.result === "FAIL"
      )
    ).toBe(true);

    let registry = registerRegistryCommitment({
      objectId: fixture.object.id,
      objectRoot: v1Verification.objectRoot,
      evidenceRoot: v1Verification.evidenceRoot
    });
    expect(registry.commitments).toHaveLength(1);
    expect(registry.commitments[0]!.version).toBe(1);

    // ---- vN: four independent venues converge (distinct observation times) ----
    const formation = synchronizeEconomicObject({
      object: fixture.object,
      history: [],
      deliveries: fixture.phases.formation!,
      policy: policy()
    });
    expect(formation.created).toBe(true);
    expect(formation.current.object.version).toBe(2);
    expect(formation.current.object.status).toBe("RESOLVED");
    expect(formation.reconciliation.conflicts).toEqual([]);
    expect(formation.reconciliation.duplicatesDropped).toBe(0);

    const admitted = formation.reconciliation.admitted.filter((item) => item.status === "ADMITTED");
    expect(admitted).toHaveLength(4);

    const applied = formation.reconciliation.applied;
    expect(applied).toHaveLength(4);
    expect(applied.every((item) => item.state === "ATTESTED")).toBe(true);

    const observationTimes = applied.map((item) => item.observedAt);
    expect(new Set(observationTimes).size).toBe(4);
    expect(applied.map((item) => item.venueId).sort()).toEqual([
      "venue:chain-observer",
      "venue:fund-admin",
      "venue:issuer",
      "venue:oracle"
    ]);

    const provenance = formation.reconciliation.admitted.map((item) => ({
      deliveryId: item.deliveryId,
      venueId: item.venueId,
      status: item.status,
      reasonCodes: item.reasonCodes
    }));
    expect(provenance.every((item) => item.venueId.startsWith("venue:"))).toBe(true);

    const vN = formation.current.object;
    const vNVerification = verifyAt(vN, nowMs);
    expect(vNVerification.overallStatus).toBe("PASS");
    const vNDecision = evaluateMandate(vN, vNVerification, mandate(), { nowMs });
    expect(vNDecision.decision).toBe("ALLOW");

    registry = updateRegistryCommitment(registry, {
      objectId: vN.id,
      expectedVersion: 1,
      objectRoot: vNVerification.objectRoot,
      evidenceRoot: vNVerification.evidenceRoot
    });
    expect(registry.commitments).toHaveLength(2);
    expect(registry.commitments[1]!.version).toBe(2);

    // ---- Noema AI proposal: proposal-only, deterministic promotion ----
    const proposal = fixture.aiProposal as Parameters<typeof hashNoemaAiProposal>[0];
    const proposalHash = hashNoemaAiProposal(proposal);
    const promotion = reduceAiProposalPromotion(proposal, {
      object: vN,
      sourceSnapshots: fixture.snapshots,
      proposalHash,
      aiRunId: "ai:terminal:run-1",
      policy: { nowMs, maxEvidenceAgeMs: fixture.policy.maxEvidenceAgeMs }
    });
    const navDecision = promotion.decisions.find(
      (decision) => decision.itemKind === "CLAIM"
    )!;
    expect(navDecision.outcome).toBe("ACCEPT_AS_INFERRED");
    expect(navDecision.reasonCodes).toEqual(["EXPLICIT_AI_INFERENCE"]);

    const promoted = applyAcceptedAiProposal({
      proposal,
      promotion,
      object: vN,
      nowMs
    });
    const promotedClaim = promoted.claims.find((claim) => claim.property === "NAV" && claim.state === "INFERRED");
    expect(promotedClaim).toBeDefined();

    const aiVerification = verifyAt(promoted, nowMs);
    expect(aiVerification.overallStatus).toBe("UNRESOLVED");
    expect(
      aiVerification.checks.some((check) => check.type === "INFERENCE_BOUNDARY")
    ).toBe(true);
    const aiDecision = evaluateMandate(promoted, aiVerification, mandate(), { nowMs });
    expect(aiDecision.decision).toBe("CONDITIONAL");

    // Canonical vN unchanged by the proposal-only promotion.
    const canonicalAfterProposal = synchronizeEconomicObject({
      object: fixture.object,
      history: [],
      deliveries: fixture.phases.formation!,
      policy: policy()
    });
    expect(JSON.stringify(canonicalAfterProposal.current.object)).toBe(JSON.stringify(vN));

    // ---- Asynchronous late NAV arrival: vN+1 (OBSERVED, temporal skew) ----
    const late = synchronizeEconomicObject({
      object: vN,
      history: formation.history,
      deliveries: fixture.phases.lateNav!,
      policy: policy()
    });
    expect(late.created).toBe(true);
    expect(late.current.object.version).toBe(3);
    const lateSkew = late.reconciliation.temporalSkew.find(
      (item) => item.venueId === "venue:fund-admin"
    );
    expect(lateSkew?.skewMs).toBeGreaterThan(fixture.policy.lateEvidenceThresholdMs);
    const lateNavClaim = late.current.object.claims.find((claim) => claim.id === NAV_CLAIM_ID);
    expect(lateNavClaim?.state).toBe("OBSERVED");
    expect(lateNavClaim?.attestationRefs).toEqual([LATE_NAV_ATTESTATION_ID]);

    const vN1 = late.current.object;
    const vN1Verification = verifyAt(vN1, nowMs);
    expect(vN1Verification.overallStatus).toBe("PASS");
    const vN1Decision = evaluateMandate(vN1, vN1Verification, mandate(), { nowMs });
    expect(vN1Decision.decision).toBe("BLOCK");
    expect(
      vN1Decision.policyChecks.some(
        (check) => check.ruleId === "mandate:claim:NAV:ATTESTED" && check.result === "FAIL"
      )
    ).toBe(true);

    registry = updateRegistryCommitment(registry, {
      objectId: vN1.id,
      expectedVersion: 2,
      objectRoot: vN1Verification.objectRoot,
      evidenceRoot: vN1Verification.evidenceRoot
    });
    expect(registry.commitments).toHaveLength(3);

    // ---- Watch: material async change emits a SemanticEvent + notifications ----
    const watchState = initializeWatchState(vN);
    const watched = processWatchedChange({
      state: watchState,
      watch: {
        id: "watch:terminal",
        objectId: vN.id,
        mandateId: mandate().id,
        webhookUrl: "https://notify.example/terminal",
        discordChannel: "discord:terminal"
      },
      candidate: vN1,
      changeId: "change:terminal:late-nav",
      previousVerification: vNVerification,
      previousDecision: vNDecision,
      nowMs,
      evaluate: (object) => {
        const nextVerification = verifyAt(object, nowMs);
        return {
          verification: nextVerification,
          decision: evaluateMandate(object, nextVerification, mandate(), { nowMs })
        };
      }
    });
    expect(watched.result.changed).toBe(true);
    expect(watched.result.event).toBeDefined();
    expect(watched.result.event?.oldVersion).toBe(2);
    expect(watched.result.event?.newVersion).toBe(3);
    expect(watched.result.event?.oldDecision).toBe("ALLOW");
    expect(watched.result.event?.newDecision).toBe("BLOCK");
    expect(watched.result.notifications.map((item) => item.channel).sort()).toEqual([
      "DISCORD",
      "WEBHOOK"
    ]);

    // ---- Duplicate/no-op redelivery creates no extra version ----
    const noOp = synchronizeEconomicObject({
      object: vN1,
      history: late.history,
      deliveries: fixture.phases.noOp!,
      policy: policy()
    });
    expect(noOp.created).toBe(false);
    expect(noOp.current.object.version).toBe(3);
    expect(noOp.reconciliation.applied).toHaveLength(1);

    // ---- Reorged chain observation rejected: finality not satisfied ----
    const reorg = synchronizeEconomicObject({
      object: vN1,
      history: late.history,
      deliveries: fixture.phases.reorg!,
      policy: policy()
    });
    const reorgAdmission = reorg.reconciliation.admitted.find(
      (item) => item.deliveryId === "delivery:chain-observer:2"
    );
    expect(reorgAdmission?.status).toBe("REJECTED");
    expect(reorg.created).toBe(false);
    expect(reorg.current.object.version).toBe(3);

    // ---- Revocation: previously verified state no longer action-authoritative ----
    const revokedContext = {
      nowMs,
      maxEvidenceAgeMs: fixture.policy.maxEvidenceAgeMs,
      revokedAttestationIds: new Set([LATE_NAV_ATTESTATION_ID])
    };
    const revokedVerification = verifyEconomicObject(vN1, revokedContext);
    expect(revokedVerification.overallStatus).toBe("FAIL");
    expect(
      revokedVerification.checks.some(
        (check) => check.type === "ATTESTATION_REVOCATION" && check.result === "FAIL"
      )
    ).toBe(true);
    const revokedDecision = evaluateMandate(vN1, revokedVerification, mandate(), { nowMs });
    expect(revokedDecision.decision).toBe("BLOCK");

    // Revoked-status delivery is rejected at admission (no version).
    const revokedDelivery = synchronizeEconomicObject({
      object: vN1,
      history: late.history,
      deliveries: fixture.phases.revokedNav!,
      policy: policy()
    });
    const revokedDeliveryAdmission = revokedDelivery.reconciliation.admitted.find(
      (item) => item.deliveryId === "delivery:fund-admin:4"
    );
    expect(revokedDeliveryAdmission?.status).toBe("REJECTED");

    // ---- Historical versions preserved ----
    expect(formation.history).toHaveLength(2);
    expect(late.history).toHaveLength(3);
    expect(late.history[0]!.object.version).toBe(1);
    expect(late.history[1]!.object.version).toBe(2);
    expect(late.history[2]!.object.version).toBe(3);

    // ---- Roots reproducible: re-verification matches committed roots ----
    const committedObjects = [fixture.object, vN, vN1];
    const committedRoots = registry.commitments.map((commitment, index) => ({
      objectRoot: commitment.objectRoot,
      evidenceRoot: commitment.evidenceRoot,
      expected: verifyAt(committedObjects[index]!, nowMs)
    }));
    for (const entry of committedRoots) {
      expect(entry.expected.objectRoot).toBe(entry.objectRoot);
      expect(entry.expected.evidenceRoot).toBe(entry.evidenceRoot);
    }
    expect(registry.events.map((event) => event.type)).toEqual([
      "ObjectRegistered",
      "ObjectUpdated",
      "ObjectUpdated"
    ]);
    expect(registry.events[1]).toMatchObject({ previousVersion: 1, newVersion: 2 });
    expect(registry.events[2]).toMatchObject({ previousVersion: 2, newVersion: 3 });

    // ---- X Layer transport: commitment/attestation history preserved, no overclaim ----
    const transportTrace: Array<{ step: string; calldata: string; gas: number }> = [];
    const objectIdB32 = b32(vN.id);
    const registerCalldata = transportARegister(objectIdB32, vNVerification.objectRoot, vNVerification.evidenceRoot);
    transportTrace.push({ step: "register:vN", calldata: registerCalldata, gas: Number(gasFor(registerCalldata).estimatedTotalGas) });

    const envelopeHashes = new Map<string, string>();
    for (const delivery of fixture.phases.formation!) {
      const claimId = `claim:${vN.id}:${vN.id}:${delivery.claims[0]!.proposition}:${delivery.venueId}`;
      const claimIdB32 = b32(claimId);
      const envelopeHash = deriveVenueAttestationId(delivery.attestation);
      envelopeHashes.set(claimId, envelopeHash);
      const attestCalldata = transportAAttest(objectIdB32, claimIdB32, envelopeHash);
      transportTrace.push({
        step: `attest:${delivery.venueId}`,
        calldata: attestCalldata,
        gas: Number(gasFor(attestCalldata).estimatedTotalGas)
      });
      const anchorCalldata = transportBAnchor(objectIdB32, claimIdB32, envelopeHash);
      transportTrace.push({
        step: `anchor:${delivery.venueId}`,
        calldata: anchorCalldata,
        gas: Number(gasFor(anchorCalldata).estimatedTotalGas)
      });
    }
    expect(envelopeHashes.size).toBe(4);
    expect(new Set(envelopeHashes.values()).size).toBe(4);
    expect(transportTrace.every((step) => step.gas > 0)).toBe(true);
    expect(transportTrace[0]!.step).toBe("register:vN");
    expect(transportTrace).toHaveLength(9);
    const transportHex = transportTrace.map((step) => step.calldata).join("");
    expect(transportHex).not.toContain("1.000000");
    expect(transportHex).not.toContain("100000000");

    // ---- Semantic relationship boundary: wrapper is lineage-linked but not economically equivalent ----
    const semantic = resolveSemanticRelationship({
      left: {
        id: "representation:rwa:fund-share",
        economicClaim: "claim:rwa:classification",
        issuerClaim: "issuer:arcadia",
        shareClass: "class-a",
        exposureClass: "US_TREASURY_BILL",
        rights: ["BENEFICIAL_INTEREST", "REDEMPTION"],
        restrictions: ["ELIGIBLE_INVESTORS_ONLY"],
        backing: ["UST-BILL-POOL-ARCADIA"],
        redemption: { asset: "USD", windowMs: 86_400_000 },
        evidenceFreshness: "FRESH"
      },
      right: {
        id: "representation:xlayer:wrapped",
        economicClaim: "claim:rwa:classification",
        issuerClaim: "issuer:arcadia",
        shareClass: "class-a",
        exposureClass: "US_TREASURY_BILL",
        rights: ["BENEFICIAL_INTEREST"],
        restrictions: ["ELIGIBLE_INVESTORS_ONLY"],
        backing: ["UST-BILL-POOL-ARCADIA"],
        redemption: { asset: "USD", windowMs: 86_400_000 },
        evidenceFreshness: "FRESH"
      },
      links: [
        {
          from: "representation:xlayer:wrapped",
          to: "representation:rwa:fund-share",
          type: "WRAPPED_REPRESENTATION_OF"
        }
      ]
    });
    expect(semantic.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(semantic.reasonCodes).toContain("RIGHTS_DIFFERENT");

    // ---- Artifacts: terminal evidence bundle + experiment state ----
    const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT })
      .toString()
      .trim();
    const trace = {
      protocolVersion: fixture.protocolVersion,
      fixtureVersion: fixture.fixtureVersion,
      gitCommit,
      times: fixture.phases.formation!.map((delivery) => ({
        venueId: delivery.venueId,
        observedAt: delivery.attestation.provenance.observedAt,
        receivedAt: delivery.receivedAt
      })),
      ingestions: ingested.map((result) => ({
        status: result.status,
        snapshotId: result.snapshot.id,
        evidenceId: result.evidence.id
      })),
      baseLineageValid: baseLineage.valid,
      representationLineage: {
        nodes: lineageTrace.nodes,
        edges: lineageTrace.edges,
        cycles: lineageTrace.cycles,
        ambiguous: lineageTrace.ambiguous
      },
      v1: {
        version: fixture.object.version,
        objectRoot: v1Verification.objectRoot,
        decision: v1Decision.decision
      },
      vN: {
        version: vN.version,
        objectRoot: vNVerification.objectRoot,
        evidenceRoot: vNVerification.evidenceRoot,
        verification: vNVerification.overallStatus,
        decision: vNDecision.decision,
        admissions: provenance,
        observationTimes
      },
      aiProposal: {
        proposalId: proposal.proposalId,
        proposalHash,
        outcome: navDecision.outcome,
        reasonCodes: navDecision.reasonCodes,
        verification: aiVerification.overallStatus,
        decision: aiDecision.decision,
        canonicalObjectUnchanged: true
      },
      vN1: {
        version: vN1.version,
        objectRoot: vN1Verification.objectRoot,
        evidenceRoot: vN1Verification.evidenceRoot,
        verification: vN1Verification.overallStatus,
        decision: vN1Decision.decision,
        navClaimState: lateNavClaim?.state,
        lateSkewMs: lateSkew?.skewMs
      },
      noOp: { created: noOp.created, version: noOp.current.object.version },
      reorg: { status: reorgAdmission?.status, created: reorg.created },
      revocation: {
        verification: revokedVerification.overallStatus,
        decision: revokedDecision.decision,
        revokedAttestationId: LATE_NAV_ATTESTATION_ID,
        revokedDeliveryStatus: revokedDeliveryAdmission?.status
      },
      watch: {
        changed: watched.result.changed,
        eventId: watched.result.event?.id,
        oldVersion: watched.result.event?.oldVersion,
        newVersion: watched.result.event?.newVersion,
        oldDecision: watched.result.event?.oldDecision,
        newDecision: watched.result.event?.newDecision,
        notifications: watched.result.notifications.map((item) => item.channel)
      },
      registry: {
        commitments: registry.commitments.map((commitment) => ({
          version: commitment.version,
          objectRoot: commitment.objectRoot,
          evidenceRoot: commitment.evidenceRoot
        })),
        events: registry.events
      },
      transport: transportTrace
    };

    mkdirSync(STATE_DIR, { recursive: true });
    mkdirSync(BUNDLE_DIR, { recursive: true });
    writeFileSync(
      resolve(STATE_DIR, "raw-trace.json"),
      `${JSON.stringify(trace, null, 2)}\n`
    );

    const result = {
      experimentId: "noema-terminal-convergence",
      protocolVersion: fixture.protocolVersion,
      fixtureVersion: fixture.fixtureVersion,
      gitCommit,
      status: "PASS",
      validity: {
        multiVenueFormation: admitted.length >= 3,
        distinctObservationTimes: new Set(observationTimes).size >= 3,
        representationLineageValid: lineageTrace.cycles.length === 0 && lineageTrace.ambiguous.length === 0,
        lineageEvidenceDerived: wrapperValid.valid,
        noTickerBasis: !forbiddenBasis.valid,
        aiProposalOnly: aiDecision.decision === "CONDITIONAL",
        lateNotActionAuthoritative: vN1Decision.decision === "BLOCK",
        noOpNoExtraVersion: noOp.created === false,
        reorgRejected: reorgAdmission?.status === "REJECTED",
        revocationBlocks: revokedDecision.decision === "BLOCK",
        historyPreserved: late.history.length === 3,
        rootsReproducible: committedRoots.every((entry) => entry.expected.objectRoot === entry.objectRoot),
        transportHistoryPreserved: transportTrace.length === 9 && transportTrace.every((step) => step.gas > 0),
        noTransportOverclaim: !transportHex.includes("1.000000"),
        watchEventEmitted: Boolean(watched.result.event) && watched.result.event?.newVersion === 3
      },
      result: {
        canonicalVersion: vN.version,
        finalVersion: vN1.version,
        vNDecision: vNDecision.decision,
        vN1Decision: vN1Decision.decision,
        aiDecision: aiDecision.decision,
        revokedDecision: revokedDecision.decision,
        registryCommitments: registry.commitments.map((commitment) => commitment.version)
      }
    };
    writeFileSync(
      resolve(STATE_DIR, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`
    );
    writeFileSync(
      resolve(STATE_DIR, "protocol.md"),
      `# Terminal Convergence Protocol (noema-terminal-convergence-protocol-v1)

End-to-end proof that one multi-venue RWA economic object converges deterministically
across: venue/source observations -> SourceSnapshots -> Evidence -> scoped venue economic
attestations -> representation lineage -> Noema AI proposals -> deterministic promotion ->
EconomicObject vN -> asynchronous venue changes -> finality/scope validation -> vN+1 or
explicit conflict/no-op -> VerificationReceipt -> Mandate reevaluation -> SemanticEvent ->
X Layer commitment/attestation history.

## Fixture
- ${fixture.fixtureVersion}, frozen at ${fixture.frozenAt}
- object ${fixture.object.id}
- venues: issuer, fund-admin, oracle, chain-observer (distinct observation times)
- non-happy-paths: late NAV (temporal skew), duplicate/no-op redelivery, reorged chain
  observation, revoked attestation

## Trace
See raw-trace.json for the full machine-readable trace and result.json for the verdict.
`
    );

    const bundle = {
      bundleId: "noema-terminal-convergence-bundle-v1",
      protocolVersion: fixture.protocolVersion,
      fixtureVersion: fixture.fixtureVersion,
      gitCommit,
      frozenAt: fixture.frozenAt,
      objectId: vN.id,
      canonicalVersion: vN.version,
      finalVersion: vN1.version,
      verificationReceipts: {
        v1: { objectRoot: v1Verification.objectRoot, evidenceRoot: v1Verification.evidenceRoot },
        vN: { objectRoot: vNVerification.objectRoot, evidenceRoot: vNVerification.evidenceRoot },
        vN1: { objectRoot: vN1Verification.objectRoot, evidenceRoot: vN1Verification.evidenceRoot }
      },
      registry: registry.commitments,
      transportTrace,
      admissionProvenance: provenance,
      fixturePath: "fixtures/terminal/terminal-rwa-v1.json",
      scenarioPaths: [
        "fixtures/terminal/scenario/scenario-v1.json",
        "fixtures/terminal/scenario/scenario-v2-late.json"
      ]
    };
    writeFileSync(
      resolve(BUNDLE_DIR, "bundle.json"),
      `${JSON.stringify(bundle, null, 2)}\n`
    );
  });

  it("reproduces the same canonical result under delivery-order permutation and CLI replay", async () => {
    const ordered = synchronizeEconomicObject({
      object: fixture.object,
      history: [],
      deliveries: fixture.phases.formation!,
      policy: policy()
    });
    const reversed = synchronizeEconomicObject({
      object: fixture.object,
      history: [],
      deliveries: [...fixture.phases.formation!].reverse(),
      policy: policy()
    });
    expect(JSON.stringify(ordered.current.object)).toBe(JSON.stringify(reversed.current.object));

    const replay = await capture(["--format=json", "synchrony", "replay", SCENARIO_V1]);
    const replayOutcome = replayDetails(replay.text);
    expect(replayOutcome.code).toBe(0);
    expect(replayOutcome.details.deterministicConvergence).toBe(true);
    const admissions = replayOutcome.details.orderedAdmissions as Array<{
      status: string;
      reasonCodes: string[];
    }>;
    expect(admissions).toHaveLength(4);
    expect(admissions.every((item) => item.status === "ADMITTED")).toBe(true);

    const lateReplay = await capture(["--format=json", "synchrony", "replay", SCENARIO_LATE]);
    const lateOutcome = replayDetails(lateReplay.text);
    expect(lateOutcome.code).toBe(0);
    expect(lateOutcome.details.deterministicConvergence).toBe(true);
  });

  it("keeps the terminal evidence bundle free of secrets", () => {
    const bundlePath = resolve(BUNDLE_DIR, "bundle.json");
    expect(existsSync(bundlePath)).toBe(true);
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Record<string, unknown>;
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          keys.add(key);
          walk(child);
        }
      }
    };
    walk(bundle);
    for (const forbidden of ["privateKey", "secret", "mnemonic", "passphrase", "NOEMA_ATTESTER_KEY"]) {
      expect([...keys].some((key) => key.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
    const text = readFileSync(bundlePath, "utf8");
    expect(text).not.toContain("SK-");
    expect(text).not.toContain("BEGIN PRIVATE KEY");
  });
});