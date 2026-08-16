import { describe, expect, it } from "vitest";
import type { Mandate, SourceSnapshot } from "@noema/economic-kernel";
import { validateEconomicObjectLineage } from "@noema/noema-core";
import { evaluateMandate } from "@noema/noema-core/mandate";
import {
  externalProviderObservationEnvelope,
  fromSdkSnapshot,
  machineSourceFailure,
  toMcpResource,
  toRestSnapshot,
  type CanonicalNoemaSnapshot
} from "@noema/noema-core/surfaces";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;

function canonicalSnapshot(): CanonicalNoemaSnapshot {
  const base = makeEconomicObject();
  const evidence = base.evidence[0]!;
  const claim = base.claims[0]!;
  const object = makeEconomicObject({
    claims: [{ ...claim, state: "STALE" }],
    evidence: [{ ...evidence, freshness: "STALE" }],
    exceptions: [
      {
        id: "exception:surface:stale",
        objectId: base.id,
        type: "EVIDENCE_STALE",
        severity: "BLOCKING",
        affectedClaims: [claim.id],
        evidence: [evidence.id],
        detectedAt: NOW,
        status: "OPEN"
      }
    ],
    status: "STALE"
  });
  const verification = verifyEconomicObject(object, {
    nowMs: NOW,
    maxEvidenceAgeMs: 3_600_000
  });
  const mandate: Mandate = {
    id: "mandate:surface",
    version: 1,
    principal: "treasury:surface",
    objective: "Require fresh Treasury evidence",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: [],
    jurisdictions: [],
    requiredClaims: [],
    requiredEvidence: [{ type: "API_RESPONSE", maxAgeMs: 3_600_000 }],
    maxEvidenceAgeMs: 3_600_000
  };
  const decision = evaluateMandate(object, verification, mandate, { nowMs: NOW });
  const snapshot: SourceSnapshot = {
    id: evidence.source,
    schemaId: "noema:source-snapshot",
    schemaVersion: 1,
    sourceId: "issuer:surface",
    uri: "https://issuer.example/surface.json",
    contentType: "application/json",
    contentHash: evidence.contentHash,
    fetchedAt: evidence.fetchedAt,
    httpStatus: 200,
    bodyStorageRef: "storage:surface"
  };
  const lineage = validateEconomicObjectLineage(object, [snapshot]);
  return { object, verification, decision, lineage };
}

describe("Noema machine-surface semantic parity", () => {
  it("REST, SDK, and MCP preserve the same canonical object and receipts", () => {
    const canonical = canonicalSnapshot();
    const rest = toRestSnapshot(canonical);
    const sdk = fromSdkSnapshot(canonical);
    const mcp = toMcpResource(canonical);

    expect(rest.snapshot).toEqual(canonical);
    expect(sdk).toEqual(canonical);
    expect(mcp.snapshot).toEqual(canonical);

    for (const surfaced of [rest.snapshot, sdk, mcp.snapshot]) {
      expect(surfaced.object.id).toBe(canonical.object.id);
      expect(surfaced.object.version).toBe(canonical.object.version);
      expect(surfaced.object.status).toBe("STALE");
      expect(surfaced.object.exceptions).toEqual(canonical.object.exceptions);
      expect(surfaced.verification.id).toBe(canonical.verification.id);
      expect(surfaced.verification.objectRoot).toBe(canonical.verification.objectRoot);
      expect(surfaced.verification.evidenceRoot).toBe(canonical.verification.evidenceRoot);
      expect(surfaced.verification.overallStatus).toBe("FAIL");
      expect(surfaced.decision.id).toBe(canonical.decision.id);
      expect(surfaced.decision.decision).toBe("BLOCK");
      expect(surfaced.lineage).toEqual(canonical.lineage);
    }
  });

  it("returns independent projections without mutating canonical state", () => {
    const canonical = canonicalSnapshot();
    const rest = toRestSnapshot(canonical);
    rest.snapshot.object.status = "RESOLVED";

    expect(canonical.object.status).toBe("STALE");
    expect(fromSdkSnapshot(canonical).object.status).toBe("STALE");
  });

  it("keeps source failures explicit and machine-readable", () => {
    const failure = machineSourceFailure(
      "source:external:1",
      "TIMEOUT",
      "External provider did not respond"
    );

    expect(failure).toEqual({
      status: "SOURCE_FAILURE",
      sourceId: "source:external:1",
      code: "TIMEOUT",
      message: "External provider did not respond",
      unavailable: true
    });
  });

  it("terminates external provider output at an observation envelope", () => {
    const envelope = externalProviderObservationEnvelope({
      sourceSnapshotId: "snapshot:provider:1",
      evidenceId: "evidence:provider:1",
      authority: "MARKET_DATA"
    });

    expect(envelope.status).toBe("OBSERVATION_ONLY");
    expect("verified" in envelope).toBe(false);
    expect("relationship" in envelope).toBe(false);
    expect("decision" in envelope).toBe(false);
    expect("objectStatus" in envelope).toBe(false);
  });
});
