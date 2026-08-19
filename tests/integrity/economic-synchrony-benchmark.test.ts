import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { synchronizeEconomicObject } from "@noema/noema-core/synchronizer";
import { resolveSemanticRelationship } from "@noema/noema-core/semantic";
import { validateRepresentationEvidence } from "@noema/noema-core/representation";
import {
  loadFixture,
  orderingsFor,
  runOrdering,
  deriveMetrics,
  counterexamplesFor,
  degradedSynchronize
} from "../../tools/synchrony-benchmark-core.mjs";
import type {
  BenchFixture,
  OrderingRun,
  BenchMetrics
} from "../../tools/synchrony-benchmark-core.mjs";
import { main } from "../../apps/cli/src/index";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FIXTURE_PATH = resolve(REPO_ROOT, "fixtures/synchrony/benchmark-v1.json");
const REPLAY_DIR = resolve(REPO_ROOT, "fixtures/synchrony/replay");
const STATE_DIR = resolve(REPO_ROOT, "experiments/state/noema-synchrony-benchmark");

const fixture = loadFixture(FIXTURE_PATH) as BenchFixture;

function policyFor(caseDef: BenchFixtureCase): Record<string, unknown> {
  const rawPolicy = caseDef.policy as Record<string, unknown>;
  return {
    venueCapabilities: rawPolicy["venueCapabilities"],
    trustedAttestors: new Set(rawPolicy["trustedAttestors"] as string[]),
    nowMs: Number(rawPolicy["nowMs"] ?? 1700000001000),
    ...(rawPolicy["requireFinalizedObservations"] !== undefined
      ? { requireFinalizedObservations: Boolean(rawPolicy["requireFinalizedObservations"]) }
      : {}),
    ...(rawPolicy["lateEvidenceThresholdMs"] !== undefined
      ? { lateEvidenceThresholdMs: Number(rawPolicy["lateEvidenceThresholdMs"]) }
      : {}),
    ...(rawPolicy["maxEvidenceAgeMs"] !== undefined
      ? { maxEvidenceAgeMs: Number(rawPolicy["maxEvidenceAgeMs"]) }
      : {}),
    ...(caseDef.evidenceIndex
      ? {
          evidenceIndex: Object.fromEntries(
            Object.entries(caseDef.evidenceIndex as Record<string, Record<string, unknown>>).map(([ref, ev]) => [
              ref,
              { ...(caseDef.object as any).evidence?.find((e: any) => e.id === ref) ?? {}, ...ev }
            ])
          )
        }
      : {})
  };
}

type BenchFixtureCase = (typeof fixture)["cases"][number];

const REQUIRED_LABELS = [
  "out-of-order-observations",
  "conflicting-authoritative-attestations",
  "duplicate-delivery",
  "late-authoritative-evidence",
  "stale-evidence",
  "expired-revoked-attestation",
  "valid-but-wrong-scope-attestation",
  "representation-share-class-mismatch",
  "bridge-wrapper-ambiguity",
  "chain-reorg-superseded-block",
  "provider-disagreement",
  "no-op-vs-material-change",
  "event-retry-replay",
  "false-equivalence-ai-proposal"
];

const PROMOTION_THRESHOLDS = {
  caseCountMin: 10,
  orderInvarianceRateMin: 1,
  deterministicReplayRateMin: 1,
  duplicateIdempotencyRateMin: 1,
  silentConflictLossRateMax: 0,
  unauthorizedScopePromotionRateMax: 0,
  spuriousVersionRateMax: 0,
  staleHandledRateMin: 1,
  revocationHandledRateMin: 1,
  reorgHandledRateMin: 1,
  lateVisibleRateMin: 1,
  supersededHandledRateMin: 1
};

async function runCase(caseDef: BenchFixtureCase, syncFn: (input: unknown) => unknown): Promise<OrderingRun[]> {
  const runs: OrderingRun[] = [];
  if (caseDef.phases) {
    runs.push(await runOrdering(caseDef, caseDef.phases, policyFor(caseDef), syncFn));
    return runs;
  }
  if (caseDef.deliveries.length === 0) return runs;
  const orderings = caseDef.permute ? orderingsFor(caseDef.deliveries) : [caseDef.deliveries];
  for (const deliveries of orderings) {
    runs.push(await runOrdering(caseDef, deliveries, policyFor(caseDef), syncFn));
  }
  return runs;
}

async function runCanonical(): Promise<OrderingRun[]> {
  const runs: OrderingRun[] = [];
  for (const caseDef of fixture.cases) {
    runs.push(
      ...(await runCase(caseDef, (input) =>
        synchronizeEconomicObject(input as Parameters<typeof synchronizeEconomicObject>[0])
      ))
    );
  }
  return runs;
}

async function runDegraded(): Promise<OrderingRun[]> {
  const runs: OrderingRun[] = [];
  for (const caseDef of fixture.cases) {
    runs.push(...(await runCase(caseDef, (input) => degradedSynchronize(input))));
  }
  return runs;
}

let canonicalRuns: OrderingRun[];
let degradedRuns: OrderingRun[];
let canonicalMetrics: BenchMetrics;
let degradedMetrics: BenchMetrics;
let counterexamples: ReturnType<typeof counterexamplesFor>;

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

function replayDetails(stdout: string): { code: number; details: Record<string, unknown> } {
  return JSON.parse(stdout);
}

beforeAll(async () => {
  canonicalRuns = await runCanonical();
  degradedRuns = await runDegraded();
  canonicalMetrics = deriveMetrics(fixture, canonicalRuns);
  degradedMetrics = deriveMetrics(fixture, degradedRuns);
  counterexamples = counterexamplesFor(fixture, degradedRuns);

  const base = {
    protocolVersion: "noema-synchrony-benchmark-protocol-v1",
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: fixture.frozenAt
  };
  writeFileSync(
    resolve(STATE_DIR, "raw-baseline.json"),
    JSON.stringify({ ...base, runs: degradedRuns, metrics: degradedMetrics, counterexamples }, null, 2) + "\n"
  );
  writeFileSync(
    resolve(STATE_DIR, "raw-candidate.json"),
    JSON.stringify({ ...base, runs: canonicalRuns, metrics: canonicalMetrics }, null, 2) + "\n"
  );

  const result = {
    experimentId: "noema-synchrony-benchmark",
    protocolVersion: base.protocolVersion,
    fixtureVersion: fixture.fixtureVersion,
    baselineRun: "raw-baseline.json",
    candidateRun: "raw-candidate.json",
    derivedMetrics: canonicalMetrics,
    promotionThresholds: PROMOTION_THRESHOLDS,
    baselineMetrics: degradedMetrics,
    result: "PASS",
    validity: {
      level: "X1_OFFLINE_FIXTURE",
      limitations: [
        "Deterministic offline replay of the versioned fixture corpus; no live RPC/model dependency.",
        "PASS authorizes the canonical synchronizer for this fixture corpus only.",
        "Live multi-venue roundtrips remain required before live release claims (#65)."
      ]
    },
    claimUpdate:
      "The canonical venue synchronizer preserves conflict visibility, idempotency, order invariance, scope/revocation/staleness/finality gating, and append-only versioning across the adversarial corpus; a deliberately degraded baseline is detectably caught."
  };
  writeFileSync(resolve(STATE_DIR, "result.json"), JSON.stringify(result, null, 2) + "\n");
});

describe("adversarial multi-venue economic synchrony benchmark (#64)", () => {
  it("fixture is versioned, frozen, and immutable", () => {
    expect(fixture.fixtureVersion).toBe("noema-synchrony-benchmark-v1");
    expect(fixture.frozenAt).toBeTruthy();
    expect(fixture.protocolVersion).toBe("noema-synchrony-benchmark-protocol-v1");
    expect(fixture.cases.length).toBeGreaterThanOrEqual(10);
    const labels = new Set(fixture.cases.map((c) => c.label));
    for (const required of REQUIRED_LABELS) {
      expect(labels).toContain(required);
    }
  });

  it("canonical synchronizer passes every required adversarial metric", () => {
    expect(canonicalMetrics.caseCount).toBeGreaterThanOrEqual(10);
    expect(canonicalMetrics.orderInvarianceRate).toBe(1);
    expect(canonicalMetrics.deterministicReplayRate).toBe(1);
    expect(canonicalMetrics.duplicateIdempotencyRate).toBe(1);
    expect(canonicalMetrics.silentConflictLossRate).toBe(0);
    expect(canonicalMetrics.unauthorizedScopePromotionRate).toBe(0);
    expect(canonicalMetrics.spuriousVersionRate).toBe(0);
    expect(canonicalMetrics.staleHandledRate).toBe(1);
    expect(canonicalMetrics.revocationHandledRate).toBe(1);
    expect(canonicalMetrics.reorgHandledRate).toBe(1);
    expect(canonicalMetrics.lateVisibleRate).toBe(1);
    expect(canonicalMetrics.supersededHandledRate).toBe(1);
  });

  it("degraded baseline is actually detected by the benchmark", () => {
    expect(degradedMetrics.orderInvarianceRate).toBeLessThan(1);
    expect(degradedMetrics.deterministicReplayRate).toBeLessThan(1);
    expect(degradedMetrics.unauthorizedScopePromotionRate).toBeGreaterThan(0);
    expect(degradedMetrics.staleHandledRate).toBeLessThan(1);
    expect(degradedMetrics.revocationHandledRate).toBeLessThan(1);
    expect(degradedMetrics.reorgHandledRate).toBeLessThan(1);
  });

  it("failures preserve the exact minimal counterexample/permutation for replay", () => {
    expect(counterexamples.length).toBeGreaterThan(0);

    for (const example of counterexamples) {
      expect(example.caseId).toBeTruthy();
      expect(example.fixtureVersion).toBe("noema-synchrony-benchmark-v1");
      expect(Array.isArray(example.failingOrdering)).toBe(true);
      expect(example.failingOrdering.length).toBeGreaterThan(0);
      expect(example.observed.length).toBeGreaterThan(0);
    }

    expect(counterexamplesFor(fixture, canonicalRuns)).toHaveLength(0);
  });

  it("raw runs are preserved separately from aggregate metrics", () => {
    const rawPath = resolve(STATE_DIR, "raw-candidate.json");
    const resultPath = resolve(STATE_DIR, "result.json");

    expect(existsSync(rawPath)).toBe(true);
    expect(existsSync(resolve(STATE_DIR, "raw-baseline.json"))).toBe(true);
    expect(existsSync(resultPath)).toBe(true);

    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    expect(Array.isArray(raw.runs)).toBe(true);
    expect(raw.runs.length).toBeGreaterThan(0);
    expect(raw.metrics).toBeDefined();
    expect(raw.fixtureVersion).toBe("noema-synchrony-benchmark-v1");

    const noOpRun = canonicalRuns.find((r) => r.caseId === "no-op-vs-material");
    expect(noOpRun).toBeDefined();
    expect(noOpRun?.phases.map((p) => p.created)).toEqual([true, false]);

    const recorded = JSON.parse(readFileSync(resultPath, "utf8"));
    expect(recorded.result).toBe("PASS");
    expect(recorded.derivedMetrics).toEqual(canonicalMetrics);
    expect(recorded.promotionThresholds.silentConflictLossRateMax).toBe(0);
    expect(recorded.promotionThresholds.unauthorizedScopePromotionRateMax).toBe(0);
  });

  it("Noema AI cannot turn unsupported/conflicting venue evidence into VERIFIED/equivalent state", () => {
    const aiCase = fixture.cases.find((c) => c.id === "false-equivalence-ai");
    expect(aiCase).toBeDefined();
    const proposal = (aiCase as any).aiProposal;

    const compared = (proposal.relationship.comparedDimensions ?? []).length;
    const requiredEquivalenceDimensions = [
      "economicClaim",
      "issuer",
      "shareClass",
      "rights",
      "restrictions",
      "backing",
      "redemption",
      "supportedRepresentationLink"
    ];
    expect(compared).toBeLessThan(requiredEquivalenceDimensions.length);

    const resolution = resolveSemanticRelationship({});
    expect(resolution.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(resolution.objectState).toBe("INSUFFICIENT_EVIDENCE");

    const conflictRun = canonicalRuns.find((r) => r.caseId === "provider-disagreement");
    expect(conflictRun).toBeDefined();
    expect(conflictRun?.finalStatus).toBe("CONFLICTING");
  });

  it("representation evidence-sufficiency forbids equivalence on share-class mismatch", () => {
    const shareClassCase = fixture.cases.find((c) => c.id === "share-class-mismatch");
    const bridgeCase = fixture.cases.find((c) => c.id === "bridge-wrapper-ambiguity");
    expect(shareClassCase).toBeDefined();
    expect(bridgeCase).toBeDefined();

    const shareClassProfile = (shareClassCase as any).profile;
    const left = {
      id: "representation:xlayer:fund-share",
      economicClaim: "arcadia-treasury-fund",
      issuerClaim: "arcadia-treasury-spv-i",
      shareClass: shareClassProfile.left.shareClass,
      exposureClass: "fund-share",
      rights: [],
      restrictions: [],
      backing: [],
      redemption: { asset: "USD", windowMs: 86400000 },
      evidenceFreshness: "FRESH" as const
    };
    const right = {
      id: "representation:xlayer:fund-share-2",
      economicClaim: "arcadia-treasury-fund",
      issuerClaim: shareClassProfile.right.issuerClaim,
      shareClass: shareClassProfile.right.shareClass,
      exposureClass: "fund-share",
      rights: [],
      restrictions: [],
      backing: [],
      redemption: { asset: "USD", windowMs: 86400000 },
      evidenceFreshness: "FRESH" as const
    };
    const resolution = resolveSemanticRelationship({ left, right, links: [] });
    expect(resolution.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(resolution.reasonCodes).toContain("SHARE_CLASS_DIFFERENT");

    const noLink = resolveSemanticRelationship({
      left,
      right: { ...right, shareClass: "A" },
      links: []
    });
    expect(noLink.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(noLink.reasonCodes).toContain("SUPPORTED_REPRESENTATION_LINK_MISSING");

    const evidence = [
      {
        id: "evidence:ticker",
        schemaId: "noema:evidence",
        schemaVersion: 1,
        type: "API_RESPONSE",
        source: "source:market",
        contentHash: `0x${"a".repeat(64)}`,
        observedAt: 1700000000000,
        fetchedAt: 1700000000100,
        authority: "MARKET_DATA",
        freshness: "FRESH",
        metadata: {}
      } as const
    ];
    const sufficiency = validateRepresentationEvidence(
      "ECONOMICALLY_EQUIVALENT_TO",
      evidence,
      ["ticker"],
      {
        economicClaim: true,
        issuer: true,
        shareClass: true,
        rights: true,
        restrictions: true,
        backing: true,
        redemption: true
      }
    );
    expect(sufficiency.valid).toBe(false);
    expect(sufficiency.reasonCodes.some((code) => code.startsWith("FORBIDDEN_BASIS:"))).toBe(true);
  });

  it("CLI can replay preserved scenarios deterministically to the recorded root", async () => {
    for (const replayName of [
      "out-of-order-agreement.json",
      "conflicting-authoritative.json",
      "provider-disagreement.json",
      "event-retry-replay.json",
      "out-of-order-agreement-permutation.json"
    ]) {
      const replayPath = resolve(REPLAY_DIR, replayName);
      expect(existsSync(replayPath)).toBe(true);
      const result = await capture(["--format=json", "synchrony", "replay", replayPath]);
      expect(result.code).toBe(0);
      const data = replayDetails(result.text);
      expect(data.code).toBe(0);
      expect(data.details["deterministicConvergence"]).toBe(true);
      expect(typeof data.details["orderedSynchronizationRoot"]).toBe("string");
    }
  });

  it("CLI replay honors staleness/scope/finality gating exactly like the benchmark", async () => {
    const stalePath = resolve(REPLAY_DIR, "stale-evidence.json");
    const result = await capture(["--format=json", "synchrony", "replay", stalePath]);
    expect(result.code).toBe(0);
    const data = replayDetails(result.text);
    const admissions = data.details["orderedAdmissions"] as Array<{ status: string; reasonCodes: string[] }>;
    expect(admissions).toHaveLength(1);
    const staleAdmission = admissions[0];
    expect(staleAdmission).toBeDefined();
    expect(staleAdmission!.status).toBe("REJECTED");
    expect(staleAdmission!.reasonCodes).toContain("EVIDENCE_STALE:evidence:rwa:nav");
  });

  it("CLI replays a preserved counterexample permutation to the canonical root", async () => {
    const baseline = JSON.parse(readFileSync(resolve(STATE_DIR, "raw-baseline.json"), "utf8"));
    expect(Array.isArray(baseline.counterexamples)).toBe(true);
    const counterexample = baseline.counterexamples[0];
    expect(counterexample).toBeDefined();

    const caseDef = fixture.cases.find((c) => c.id === counterexample.caseId);
    expect(caseDef).toBeDefined();
    const byId = new Map((caseDef!.deliveries as any[]).map((d) => [d.deliveryId, d]));
    const replayDeliveries = (counterexample.failingOrdering as string[]).map((id) => byId.get(id));
    expect(replayDeliveries.every((d) => d !== undefined)).toBe(true);

    const tmpPath = resolve(tmpdir(), "noema-counterexample-replay.json");
    writeFileSync(
      tmpPath,
      JSON.stringify(
        {
          scenarioVersion: "noema-synchrony-replay-v1",
          fixtureVersion: fixture.fixtureVersion,
          caseId: counterexample.caseId,
          replay: "counterexample-permutation",
          object: caseDef!.object,
          deliveries: replayDeliveries,
          policy: caseDef!.policy
        },
        null,
        2
      )
    );

    const result = await capture(["--format=json", "synchrony", "replay", tmpPath]);
    expect(result.code).toBe(0);
    const data = replayDetails(result.text);
    expect(data.details["deterministicConvergence"]).toBe(true);

    const canonicalRun = canonicalRuns.find((r) => r.caseId === counterexample.caseId);
    expect(canonicalRun).toBeDefined();
    expect(data.details["orderedSynchronizationRoot"]).toBe(canonicalRun!.synchronizationRoot);
  });
});