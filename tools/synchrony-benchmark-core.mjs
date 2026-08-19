// Synchrony benchmark harness core (#64).
//
// Runs the canonical venue synchronizer against the versioned adversarial
// fixture across permutations, computes the benchmark's required metrics,
// preserves raw per-permutation runs separately from aggregate metrics, and
// emits minimal counterexamples with their exact permutation for replay.
//
// Semantics notes (match packages/noema-core/src/synchronizer.ts):
// - reconciliation.admitted is a record of ALL admissions including REJECTED.
//   A delivery is "promoted" only when its admission status is ADMITTED.
// - A rejected delivery contributes no claims and produces no material change.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const FIXTURE_VERSION = "noema-synchrony-benchmark-v1";

export function loadFixture(path) {
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  if (fixture.fixtureVersion !== FIXTURE_VERSION) {
    throw new Error(`fixture version mismatch: expected ${FIXTURE_VERSION}, got ${fixture.fixtureVersion}`);
  }
  return fixture;
}

// Deterministic permutation of a delivery array. Returns a new array.
export function permuteDeliveries(deliveries, seed) {
  const list = [...deliveries];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Collects every distinct ordering we exercise for a case: file order,
// reversed order, and a fixed deterministic shuffle.
export function orderingsFor(deliveries) {
  const orderings = [];
  const seen = new Set();
  for (const candidate of [deliveries, [...deliveries].reverse(), permuteDeliveries(deliveries, 42)]) {
    const key = candidate.map((d) => d.deliveryId).join("|");
    if (!seen.has(key)) {
      seen.add(key);
      orderings.push(candidate);
    }
  }
  return orderings;
}

// Runs one case under one ordering (or a phased sequence) through the given
// synchronize function and captures the raw, replayable observation.
// The synchronize function receives { object, history, deliveries, policy }.
export async function runOrdering(caseDef, orderings, policy, synchronize) {
  const phaseInputs = Array.isArray(orderings[0]) ? orderings : [orderings];
  let object = caseDef.object;
  let history = [];
  const phases = [];

  for (const deliveries of phaseInputs) {
    const result = await synchronize({ object, history, deliveries, policy });
    const admissionStatuses = (result.reconciliation.admitted ?? []).map((a) => a.status);
    phases.push({
      deliveryOrder: deliveries.map((d) => d.deliveryId),
      created: result.created,
      synchronizationRoot: result.reconciliation.synchronizationRoot,
      finalVersion: result.current.object.version,
      finalStatus: result.current.object.status,
      admittedCount: admissionStatuses.filter((s) => s === "ADMITTED").length,
      rejectedCount: admissionStatuses.filter((s) => s === "REJECTED").length,
      appliedCount: (result.reconciliation.applied ?? []).length,
      conflicts: (result.reconciliation.conflicts ?? []).length,
      duplicatesDropped: result.reconciliation.duplicatesDropped ?? 0,
      appliedStates: (result.reconciliation.applied ?? []).map((a) => a.state),
      reasonCodes: [...new Set(admissionStatuses.flatMap((_, i) =>
        (result.reconciliation.admitted ?? [])[i]?.reasonCodes ?? []
      ))].sort()
    });
    object = result.current.object;
    history = result.history;
  }

  const last = phases[phases.length - 1];
  return {
    caseId: caseDef.id,
    deliveryOrder: phaseInputs.flat().map((d) => d.deliveryId),
    phaseCount: phases.length,
    phases,
    created: last.created,
    synchronizationRoot: last.synchronizationRoot,
    finalVersion: last.finalVersion,
    finalStatus: last.finalStatus,
    admitted: last.admittedCount,
    rejected: last.rejectedCount,
    applied: last.appliedCount,
    conflicts: last.conflicts,
    duplicatesDropped: last.duplicatesDropped,
    appliedStates: last.appliedStates,
    reasonCodes: last.reasonCodes
  };
}

// Computes derived metrics from the per-case per-ordering raw runs, using the
// case expectation labels from the fixture.
export function deriveMetrics(fixture, runs) {
  const byCase = new Map();
  for (const run of runs) {
    const bucket = byCase.get(run.caseId) ?? [];
    bucket.push(run);
    byCase.set(run.caseId, bucket);
  }

  let orderInvariantCases = 0;
  let orderInvariantPass = 0;
  let deterministicReplayCases = 0;
  let deterministicReplayPass = 0;
  let duplicateIdempotentCases = 0;
  let duplicateIdempotentPass = 0;
  let conflictCases = 0;
  let silentConflictLoss = 0;
  let unauthorizedScopeCases = 0;
  let unauthorizedScopePromotion = 0;
  let spuriousVersionCases = 0;
  let spuriousVersions = 0;
  let staleHandledCases = 0;
  let staleHandledPass = 0;
  let revocationHandledCases = 0;
  let revocationHandledPass = 0;
  let reorgHandledCases = 0;
  let reorgHandledPass = 0;
  let lateVisibleCases = 0;
  let lateVisiblePass = 0;
  let supersededHandledCases = 0;
  let supersededHandledPass = 0;

  for (const caseDef of fixture.cases) {
    const caseRuns = byCase.get(caseDef.id) ?? [];
    if (caseRuns.length === 0) continue;
    const expect = caseDef.expect;

    if (expect.orderInvariant === true && caseRuns.length > 1) {
      orderInvariantCases += 1;
      const roots = new Set(caseRuns.map((run) => run.synchronizationRoot));
      const statuses = new Set(caseRuns.map((run) => run.finalStatus));
      if (roots.size === 1 && statuses.size === 1) orderInvariantPass += 1;
    }

    deterministicReplayCases += 1;
    const roots = new Set(caseRuns.map((run) => run.synchronizationRoot));
    if (roots.size === 1) deterministicReplayPass += 1;

    if (expect.duplicatesDropped !== undefined) {
      duplicateIdempotentCases += 1;
      const dropped = caseRuns.every((run) => run.duplicatesDropped >= (expect.duplicatesDropped ?? 1));
      const singleApplied = caseRuns.every((run) => run.applied === 1);
      if (dropped && singleApplied) duplicateIdempotentPass += 1;
    }

    if (expect.conflicts !== undefined && expect.conflicts > 0) {
      conflictCases += 1;
      const silent = caseRuns.some((run) => run.conflicts === 0 || run.finalStatus !== "CONFLICTING");
      if (silent) silentConflictLoss += 1;
    }

    if (expect.unauthorizedScopePromotion !== undefined) {
      unauthorizedScopeCases += 1;
      if (expect.unauthorizedScopePromotion === false) {
        const promoted = caseRuns.some((run) => run.admitted > 0 || run.created === true);
        if (promoted) unauthorizedScopePromotion += 1;
      }
    }

    if (expect.spuriousVersion !== undefined) {
      spuriousVersionCases += 1;
      if (expect.spuriousVersion === false) {
        const spurious = caseRuns.some((run) => run.created === true);
        if (spurious) spuriousVersions += 1;
      }
    }

    if (expect.staleHandled !== undefined) {
      staleHandledCases += 1;
      if (expect.staleHandled === true) {
        const handled = caseRuns.every((run) => run.admitted === 0 && run.created === false);
        if (handled) staleHandledPass += 1;
      }
    }

    if (expect.revocationHandled !== undefined) {
      revocationHandledCases += 1;
      if (expect.revocationHandled === true) {
        const handled = caseRuns.every((run) => run.admitted === 0 && run.created === false);
        if (handled) revocationHandledPass += 1;
      }
    }

    if (expect.reorgHandled !== undefined) {
      reorgHandledCases += 1;
      if (expect.reorgHandled === true) {
        const handled = caseRuns.every((run) => run.admitted === 0 && run.created === false);
        if (handled) reorgHandledPass += 1;
      }
    }

    if (expect.lateVisible !== undefined) {
      lateVisibleCases += 1;
      if (expect.lateVisible === true) {
        const visible = caseRuns.some((run) => run.appliedStates.includes("OBSERVED"));
        if (visible) lateVisiblePass += 1;
      }
    }

    if (expect.supersededHandled !== undefined) {
      supersededHandledCases += 1;
      if (expect.supersededHandled === true) {
        const handled = caseRuns.every((run) => run.finalStatus === "RESOLVED");
        if (handled) supersededHandledPass += 1;
      }
    }
  }

  return {
    caseCount: fixture.cases.length,
    orderInvarianceRate: orderInvariantCases === 0 ? 1 : orderInvariantPass / orderInvariantCases,
    deterministicReplayRate: deterministicReplayCases === 0 ? 1 : deterministicReplayPass / deterministicReplayCases,
    duplicateIdempotencyRate: duplicateIdempotentCases === 0 ? 1 : duplicateIdempotentPass / duplicateIdempotentCases,
    silentConflictLossRate: conflictCases === 0 ? 0 : silentConflictLoss / conflictCases,
    unauthorizedScopePromotionRate: unauthorizedScopeCases === 0 ? 0 : unauthorizedScopePromotion / unauthorizedScopeCases,
    spuriousVersionRate: spuriousVersionCases === 0 ? 0 : spuriousVersions / spuriousVersionCases,
    staleHandledRate: staleHandledCases === 0 ? 1 : staleHandledPass / staleHandledCases,
    revocationHandledRate: revocationHandledCases === 0 ? 1 : revocationHandledPass / revocationHandledCases,
    reorgHandledRate: reorgHandledCases === 0 ? 1 : reorgHandledPass / reorgHandledCases,
    lateVisibleRate: lateVisibleCases === 0 ? 1 : lateVisiblePass / lateVisibleCases,
    supersededHandledRate: supersededHandledCases === 0 ? 1 : supersededHandledPass / supersededHandledCases
  };
}

// Preserves the exact minimal counterexample: any case where a permutation
// diverged from the expected outcome is captured with its delivery order so
// the CLI can replay it deterministically.
export function counterexamplesFor(fixture, runs) {
  const byCase = new Map();
  for (const run of runs) {
    const bucket = byCase.get(run.caseId) ?? [];
    bucket.push(run);
    byCase.set(run.caseId, bucket);
  }

  const counterexamples = [];
  for (const caseDef of fixture.cases) {
    const caseRuns = byCase.get(caseDef.id) ?? [];
    if (caseRuns.length === 0) continue;
    const expect = caseDef.expect;

    const roots = new Set(caseRuns.map((run) => run.synchronizationRoot));
    const diverged = roots.size > 1;

    const expectedAdmitted = expect.admitted;
    const admittedMismatch = expectedAdmitted !== undefined &&
      caseRuns.some((run) => run.admitted !== expectedAdmitted);

    const expectedConflicts = expect.conflicts;
    const conflictsMismatch = expectedConflicts !== undefined &&
      caseRuns.some((run) => run.conflicts !== expectedConflicts);

    const silentConflict = expect.silentConflictLoss === false &&
      caseRuns.some((run) => run.conflicts === 0 || run.finalStatus !== "CONFLICTING");

    const unauthorizedPromotion = expect.unauthorizedScopePromotion === false &&
      caseRuns.some((run) => run.admitted > 0 || run.created === true);

    const spurious = expect.spuriousVersion === false &&
      caseRuns.some((run) => run.created === true);

    const staleMissed = expect.staleHandled === true &&
      caseRuns.some((run) => run.admitted > 0 || run.created === true);

    const revocationMissed = expect.revocationHandled === true &&
      caseRuns.some((run) => run.admitted > 0 || run.created === true);

    const reorgMissed = expect.reorgHandled === true &&
      caseRuns.some((run) => run.admitted > 0 || run.created === true);

    if (diverged || admittedMismatch || conflictsMismatch || silentConflict || unauthorizedPromotion || spurious || staleMissed || revocationMissed || reorgMissed) {
      const failing = caseRuns.find((run) =>
        (expect.admitted !== undefined && run.admitted !== expect.admitted) ||
        (expect.conflicts !== undefined && run.conflicts !== expect.conflicts) ||
        (expect.silentConflictLoss === false && (run.conflicts === 0 || run.finalStatus !== "CONFLICTING")) ||
        (expect.unauthorizedScopePromotion === false && (run.admitted > 0 || run.created === true)) ||
        (expect.spuriousVersion === false && run.created === true) ||
        (expect.staleHandled === true && (run.admitted > 0 || run.created === true)) ||
        (expect.revocationHandled === true && (run.admitted > 0 || run.created === true)) ||
        (expect.reorgHandled === true && (run.admitted > 0 || run.created === true))
      )?.deliveryOrder ?? caseRuns[0]?.deliveryOrder ?? [];
      counterexamples.push({
        caseId: caseDef.id,
        fixtureVersion: fixture.fixtureVersion,
        failingOrdering: failing,
        observed: caseRuns.map((run) => ({
          deliveryOrder: run.deliveryOrder,
          admitted: run.admitted,
          applied: run.applied,
          conflicts: run.conflicts,
          created: run.created,
          synchronizationRoot: run.synchronizationRoot,
          finalStatus: run.finalStatus
        }))
      });
    }
  }
  return counterexamples;
}

// A deliberately degraded baseline synchronizer that the benchmark MUST be
// able to catch: it last-write-wins, ignores conflict detection, ignores
// attestation scope/revocation/staleness/finality, admits every delivery, and
// produces an order-dependent root plus a spurious version on every call.
export function degradedSynchronize(input) {
  const candidate = JSON.parse(JSON.stringify(input.object));
  const applied = [];
  const conflicts = [];
  const admitted = [];

  for (const delivery of input.deliveries) {
    admitted.push({ deliveryId: delivery.deliveryId, venueId: delivery.venueId, status: "ADMITTED", reasonCodes: [] });
    for (const claim of delivery.claims) {
      const claimId = `claim:${input.object.id}:${claim.subject}:${claim.proposition}:${delivery.venueId}`;
      candidate.claims = candidate.claims.filter((c) => c.id !== claimId);
      candidate.claims.push({
        id: claimId,
        subject: claim.subject,
        property: claim.proposition,
        value: claim.value,
        state: "ATTESTED",
        sourceRefs: [delivery.attestation.attestationId],
        evidenceRefs: claim.evidenceRefs,
        attestationRefs: [delivery.attestation.attestationId],
        observedAt: claim.observedAt,
        createdAt: input.policy.nowMs
      });
      applied.push({ claimId, venueId: delivery.venueId, proposition: claim.proposition, state: "ATTESTED" });
    }
  }

  candidate.version += 1;
  candidate.status = "RESOLVED";

  // Order-dependent root: the degraded baseline diverges across permutations,
  // which is exactly the failure the benchmark must surface.
  const orderKey = input.deliveries.map((d) => d.deliveryId).join("|");
  const root = createHash("sha256").update(`degraded:${orderKey}`, "utf8").digest("hex");

  return {
    created: true,
    history: [{ object: candidate, changeId: "degraded", material: true, objectId: candidate.id }],
    current: { object: candidate, changeId: "degraded", material: true, objectId: candidate.id },
    reconciliation: {
      candidate,
      admitted,
      applied,
      conflicts,
      duplicatesDropped: 0,
      temporalSkew: [],
      reasonCodes: [],
      synchronizationRoot: `0x${root}`
    }
  };
}