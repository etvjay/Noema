import { createHash } from "node:crypto";
import type {
  Claim,
  ClaimState,
  EconomicObject,
  Evidence,
  Hex,
  JsonValue,
  Ref,
  UnixMillis
} from "@noema/economic-kernel";
import { canonicalJson } from "@noema/canonicalization";
import {
  authorityScopeAllows,
  validateVenueAttestationScope,
  type VenueEconomicAttestationEnvelope,
  type VenueProposition,
  type VenueRole
} from "./attestation.js";
import {
  finalitySatisfiesPolicy,
  type ChainObservation,
  type FinalityPolicy
} from "./observation.js";
import {
  appendEconomicObjectChange,
  initializeVersionHistory,
  isMaterialEconomicObjectChange,
  type EconomicObjectVersionRecord
} from "./versioning.js";

export const SYNCHRONIZER_VERSION = "noema-venue-synchronizer-v1";
export const SYNCHRONIZER_HASH_VERSION = "noema-venue-synchronizer-sha256-v1";

export interface VenueClaimProposal {
  proposition: VenueProposition;
  subject: Ref;
  value: JsonValue;
  unit?: string;
  observedAt: UnixMillis;
  sourceRef?: Ref;
  evidenceRefs: Ref[];
  supersedes?: Ref;
  revokes?: Ref;
}

export interface VenueDelivery {
  deliveryId: Ref;
  venueId: Ref;
  attestation: VenueEconomicAttestationEnvelope;
  observations: ChainObservation[];
  claims: VenueClaimProposal[];
  receivedAt: UnixMillis;
}

export interface SynchronizerPolicy {
  venueCapabilities: Record<Ref, VenueRole>;
  trustedAttestors: ReadonlySet<string>;
  nowMs: UnixMillis;
  maxEvidenceAgeMs?: number;
  requireFinalizedObservations?: boolean;
  lateEvidenceThresholdMs?: number;
  evidenceIndex?: Record<Ref, Evidence>;
}

export type DeliveryAdmissionStatus = "ADMITTED" | "REJECTED";

export interface VenueDeliveryAdmission {
  deliveryId: Ref;
  venueId: Ref;
  status: DeliveryAdmissionStatus;
  reasonCodes: string[];
}

export interface TemporalSkewRecord {
  venueId: Ref;
  deliveryId: Ref;
  observedAt: UnixMillis;
  receivedAt: UnixMillis;
  skewMs: number;
}

export interface SynchronizerConflict {
  id: Ref;
  subject: Ref;
  proposition: VenueProposition;
  values: JsonValue[];
  venueIds: Ref[];
  claimRefs: Ref[];
  detectedAt: UnixMillis;
  resolutionOptions: string[];
  unresolved: boolean;
}

export interface AppliedVenueClaim {
  claimId: Ref;
  venueId: Ref;
  proposition: VenueProposition;
  subject: Ref;
  value: JsonValue;
  unit?: string;
  state: ClaimState;
  observedAt: UnixMillis;
  receivedAt: UnixMillis;
  skewMs: number;
  evidenceRefs: Ref[];
  attestationRef: Ref;
  supersededBy?: Ref;
  revokedBy?: Ref;
}

export interface ReconcileResult {
  objectId: Ref;
  candidate: EconomicObject;
  admitted: VenueDeliveryAdmission[];
  applied: AppliedVenueClaim[];
  conflicts: SynchronizerConflict[];
  duplicatesDropped: number;
  temporalSkew: TemporalSkewRecord[];
  reasonCodes: string[];
  synchronizationRoot: Hex;
}

export interface SynchronizeInput {
  object: EconomicObject;
  history: EconomicObjectVersionRecord[];
  deliveries: VenueDelivery[];
  policy: SynchronizerPolicy;
}

export interface SynchronizeResult {
  history: EconomicObjectVersionRecord[];
  created: boolean;
  current: EconomicObjectVersionRecord;
  reconciliation: ReconcileResult;
}

function canonicalValue(value: unknown): string {
  return canonicalJson(value);
}

export function deriveVenueDeliveryIdentityKey(delivery: VenueDelivery): string {
  const projection = {
    venueId: delivery.venueId,
    attestationId: delivery.attestation.attestationId,
    attestor: delivery.attestation.attestor,
    nonce: delivery.attestation.nonce,
    issuedAt: delivery.attestation.issuedAt,
    binding: delivery.attestation.binding,
    claims: [...delivery.claims]
      .sort((left, right) => {
        const byProposition = left.proposition.localeCompare(right.proposition);
        if (byProposition !== 0) return byProposition;
        return canonicalValue(left.value).localeCompare(canonicalValue(right.value));
      })
      .map((claim) => ({
        proposition: claim.proposition,
        subject: claim.subject,
        value: canonicalValue(claim.value),
        observedAt: claim.observedAt
      }))
  };
  return createHash("sha256").update(canonicalJson(projection), "utf8").digest("hex");
}

function deliveryComparator(left: VenueDelivery, right: VenueDelivery): number {
  const byVenue = left.venueId.localeCompare(right.venueId);
  if (byVenue !== 0) return byVenue;
  const byDelivery = left.deliveryId.localeCompare(right.deliveryId);
  if (byDelivery !== 0) return byDelivery;
  const byNonce = left.attestation.nonce - right.attestation.nonce;
  if (byNonce !== 0) return byNonce;
  return deriveVenueDeliveryIdentityKey(left).localeCompare(
    deriveVenueDeliveryIdentityKey(right)
  );
}

function evidenceIsFresh(
  evidence: Evidence | undefined,
  policy: SynchronizerPolicy
): boolean {
  if (evidence === undefined) return false;
  if (policy.maxEvidenceAgeMs === undefined) return true;
  return policy.nowMs - evidence.observedAt <= policy.maxEvidenceAgeMs;
}

export function admitVenueDelivery(
  delivery: VenueDelivery,
  policy: SynchronizerPolicy
): VenueDeliveryAdmission {
  const reasonCodes: string[] = [];

  const expectedRole = policy.venueCapabilities[delivery.venueId];
  if (expectedRole === undefined) {
    return {
      deliveryId: delivery.deliveryId,
      venueId: delivery.venueId,
      status: "REJECTED",
      reasonCodes: ["VENUE_NOT_REGISTERED"]
    };
  }

  const scope = validateVenueAttestationScope(delivery.attestation, {
    venueCapabilities: policy.venueCapabilities,
    trustedAttestors: policy.trustedAttestors,
    nowMs: policy.nowMs
  });
  if (!scope.valid) reasonCodes.push(...scope.reasonCodes);

  if (!policy.trustedAttestors.has(delivery.attestation.attestor)) {
    reasonCodes.push("ATTESTOR_UNTRUSTED");
  }

  if (
    delivery.attestation.status === "REVOKED" ||
    delivery.attestation.revokedAt !== undefined
  ) {
    reasonCodes.push("ATTESTATION_REVOKED");
  }
  if (
    delivery.attestation.status === "EXPIRED" ||
    (delivery.attestation.expiresAt !== undefined &&
      delivery.attestation.expiresAt < policy.nowMs)
  ) {
    reasonCodes.push("ATTESTATION_EXPIRED");
  }
  if (
    delivery.attestation.status === "SUPERSEDED" ||
    delivery.attestation.supersedes !== undefined
  ) {
    reasonCodes.push("ATTESTATION_SUPERSEDED");
  }

  const outOfScope = delivery.claims.filter(
    (claim) =>
      !authorityScopeAllows(delivery.attestation.authorityScope, claim.proposition)
  );
  if (outOfScope.length > 0) {
    reasonCodes.push(
      ...outOfScope.map((claim) => `PROPOSITION_OUT_OF_SCOPE:${claim.proposition}`)
    );
  }

  if (policy.requireFinalizedObservations === true) {
    const unresolved = delivery.observations.filter((observation) => {
      const policyInput: FinalityPolicy = {
        requireFinalized: true,
        allowPending: false
      };
      return !finalitySatisfiesPolicy(observation, policyInput).satisfied;
    });
    if (unresolved.length > 0) {
      reasonCodes.push(
        ...unresolved.map((observation) => `OBSERVATION_NOT_FINAL:${observation.observationId}`)
      );
    }
  }

  if (policy.evidenceIndex !== undefined) {
    const missing = delivery.claims
      .flatMap((claim) => claim.evidenceRefs)
      .filter((evidenceRef) => policy.evidenceIndex![evidenceRef] === undefined);
    if (missing.length > 0) {
      reasonCodes.push(...missing.map((evidenceRef) => `EVIDENCE_MISSING:${evidenceRef}`));
    }
    const stale = delivery.claims
      .flatMap((claim) => claim.evidenceRefs)
      .map((evidenceRef) => policy.evidenceIndex![evidenceRef])
      .filter((evidence): evidence is Evidence => evidence !== undefined)
      .filter((evidence) => !evidenceIsFresh(evidence, policy));
    if (stale.length > 0) {
      reasonCodes.push(...stale.map((evidence) => `EVIDENCE_STALE:${evidence.id}`));
    }
  }

  const admission: VenueDeliveryAdmission = {
    deliveryId: delivery.deliveryId,
    venueId: delivery.venueId,
    status: reasonCodes.length === 0 ? "ADMITTED" : "REJECTED",
    reasonCodes: [...new Set(reasonCodes)].sort()
  };
  return admission;
}

function claimProposalComparator(
  left: VenueClaimProposal,
  right: VenueClaimProposal
): number {
  const byProposition = left.proposition.localeCompare(right.proposition);
  if (byProposition !== 0) return byProposition;
  const bySubject = left.subject.localeCompare(right.subject);
  if (bySubject !== 0) return bySubject;
  if (left.observedAt !== right.observedAt) return left.observedAt - right.observedAt;
  return canonicalValue(left.value).localeCompare(canonicalValue(right.value));
}

export function deriveSynchronizationRoot(
  candidate: EconomicObject,
  history: readonly EconomicObjectVersionRecord[]
): Hex {
  const projection = {
    domain: "noema:venue-synchronizer:v1",
    hashVersion: SYNCHRONIZER_HASH_VERSION,
    objectId: candidate.id,
    version: candidate.version,
    status: candidate.status,
    claims: [...candidate.claims]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((claim) => ({
        id: claim.id,
        subject: claim.subject,
        property: claim.property,
        value: canonicalValue(claim.value),
        state: claim.state
      })),
    exceptions: [...candidate.exceptions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((exception) => ({
        id: exception.id,
        type: exception.type,
        status: exception.status
      })),
    lineage: history.map((record) => ({
      version: record.object.version,
      changeId: record.changeId,
      material: record.material
    }))
  };
  return `0x${createHash("sha256")
    .update(canonicalJson(projection), "utf8")
    .digest("hex")}` as Hex;
}

export function reconcileVenueDeliveries(input: SynchronizeInput): ReconcileResult {
  const { object: current, deliveries, policy } = input;
  const objectId = current.id;
  const reasonCodes: string[] = [];

  const admissions = deliveries.map((delivery) => admitVenueDelivery(delivery, policy));
  const admittedSet = new Map<string, VenueDelivery>();
  let duplicatesDropped = 0;
  for (const admission of admissions) {
    if (admission.status !== "ADMITTED") continue;
    const delivery = deliveries.find((candidate) => candidate.deliveryId === admission.deliveryId)!;
    const identityKey = deriveVenueDeliveryIdentityKey(delivery);
    if (admittedSet.has(identityKey)) {
      duplicatesDropped += 1;
      continue;
    }
    admittedSet.set(identityKey, delivery);
  }

  const admittedDeliveries = [...admittedSet.values()].sort(deliveryComparator);

  const temporalSkew: TemporalSkewRecord[] = [];
  for (const delivery of admittedDeliveries) {
    for (const claim of delivery.claims) {
      temporalSkew.push({
        venueId: delivery.venueId,
        deliveryId: delivery.deliveryId,
        observedAt: claim.observedAt,
        receivedAt: delivery.receivedAt,
        skewMs: Math.max(0, delivery.receivedAt - claim.observedAt)
      });
    }
  }
  temporalSkew.sort((left, right) => {
    const byVenue = left.venueId.localeCompare(right.venueId);
    if (byVenue !== 0) return byVenue;
    return left.deliveryId.localeCompare(right.deliveryId);
  });

  const groups = new Map<string, { delivery: VenueDelivery; claim: VenueClaimProposal }[]>();
  for (const delivery of admittedDeliveries) {
    for (const claim of [...delivery.claims].sort(claimProposalComparator)) {
      const key = `${claim.subject}\u0000${claim.proposition}`;
      const bucket = groups.get(key) ?? [];
      bucket.push({ delivery, claim });
      groups.set(key, bucket);
    }
  }

  const candidate: EconomicObject = structuredClone(current);
  const applied: AppliedVenueClaim[] = [];
  const conflicts: SynchronizerConflict[] = [];

  for (const [key, bucket] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const [subject, proposition] = key.split("\u0000") as [Ref, VenueProposition];
    const conflictKey = `conflict:${objectId}:${subject}:${proposition}`;

    const supersedeTargets = new Map<Ref, Ref>();
    const revokeTargets = new Map<Ref, Ref>();
    for (const entry of bucket) {
      if (entry.claim.supersedes !== undefined) {
        supersedeTargets.set(entry.claim.supersedes, entry.delivery.deliveryId);
      }
      if (entry.claim.revokes !== undefined) {
        revokeTargets.set(entry.claim.revokes, entry.delivery.deliveryId);
      }
    }

    const activeEntries = bucket.filter(
      (entry) =>
        !supersedeTargets.has(entry.claim.sourceRef ?? entry.claim.proposition) &&
        !revokeTargets.has(entry.claim.sourceRef ?? entry.claim.proposition)
    );

    const supersededEntries = bucket.filter((entry) =>
      supersedeTargets.has(entry.claim.sourceRef ?? entry.claim.proposition)
    );
    const revokedEntries = bucket.filter((entry) =>
      revokeTargets.has(entry.claim.sourceRef ?? entry.claim.proposition)
    );

    for (const entry of supersededEntries) {
      const claimId = `claim:${objectId}:${subject}:${proposition}:${entry.delivery.venueId}`;
      const supersededBy = supersedeTargets.get(
        entry.claim.sourceRef ?? entry.claim.proposition
      );
      applied.push({
        claimId,
        venueId: entry.delivery.venueId,
        proposition,
        subject,
        value: entry.claim.value,
        ...(entry.claim.unit !== undefined ? { unit: entry.claim.unit } : {}),
        state: "STALE",
        observedAt: entry.claim.observedAt,
        receivedAt: entry.delivery.receivedAt,
        skewMs: Math.max(0, entry.delivery.receivedAt - entry.claim.observedAt),
        evidenceRefs: entry.claim.evidenceRefs,
        attestationRef: entry.delivery.attestation.attestationId,
        ...(supersededBy !== undefined ? { supersededBy } : {})
      });
    }

    for (const entry of revokedEntries) {
      const claimId = `claim:${objectId}:${subject}:${proposition}:${entry.delivery.venueId}`;
      const revokedBy = revokeTargets.get(
        entry.claim.sourceRef ?? entry.claim.proposition
      );
      applied.push({
        claimId,
        venueId: entry.delivery.venueId,
        proposition,
        subject,
        value: entry.claim.value,
        ...(entry.claim.unit !== undefined ? { unit: entry.claim.unit } : {}),
        state: "REVOKED",
        observedAt: entry.claim.observedAt,
        receivedAt: entry.delivery.receivedAt,
        skewMs: Math.max(0, entry.delivery.receivedAt - entry.claim.observedAt),
        evidenceRefs: entry.claim.evidenceRefs,
        attestationRef: entry.delivery.attestation.attestationId,
        ...(revokedBy !== undefined ? { revokedBy } : {})
      });
    }

    const distinctValues = new Set(
      activeEntries.map((entry) => canonicalValue(entry.claim.value))
    );

    if (activeEntries.length === 0) {
      continue;
    }

    if (distinctValues.size > 1) {
      for (const entry of activeEntries) {
        const claimId = `claim:${objectId}:${subject}:${proposition}:${entry.delivery.venueId}`;
applied.push({
        claimId,
        venueId: entry.delivery.venueId,
        proposition,
        subject,
        value: entry.claim.value,
        ...(entry.claim.unit !== undefined ? { unit: entry.claim.unit } : {}),
        state: "CONFLICTING",
          observedAt: entry.claim.observedAt,
          receivedAt: entry.delivery.receivedAt,
          skewMs: Math.max(0, entry.delivery.receivedAt - entry.claim.observedAt),
          evidenceRefs: entry.claim.evidenceRefs,
          attestationRef: entry.delivery.attestation.attestationId
        });
      }
      conflicts.push({
        id: conflictKey,
        subject,
        proposition,
        values: activeEntries.map((entry) => entry.claim.value),
        venueIds: [...new Set(activeEntries.map((entry) => entry.delivery.venueId))].sort(),
        claimRefs: activeEntries.map(
          (entry) => `claim:${objectId}:${subject}:${proposition}:${entry.delivery.venueId}`
        ),
        detectedAt: policy.nowMs,
        resolutionOptions: [
          "SUPERSEDE_WITH_AUTHORITATIVE",
          "REVOKE_DISPUTED",
          "EVIDENCE_RESOLUTION"
        ],
        unresolved: true
      });
      continue;
    }

    const canonicalEntry = activeEntries[0]!;
    const claimId = `claim:${objectId}:${subject}:${proposition}:${canonicalEntry.delivery.venueId}`;
    const skewMs = Math.max(0, canonicalEntry.delivery.receivedAt - canonicalEntry.claim.observedAt);
    const isLate =
      policy.lateEvidenceThresholdMs !== undefined &&
      skewMs > policy.lateEvidenceThresholdMs;

    applied.push({
      claimId,
      venueId: canonicalEntry.delivery.venueId,
      proposition,
      subject,
      value: canonicalEntry.claim.value,
      ...(canonicalEntry.claim.unit !== undefined ? { unit: canonicalEntry.claim.unit } : {}),
      state: isLate ? "OBSERVED" : "ATTESTED",
      observedAt: canonicalEntry.claim.observedAt,
      receivedAt: canonicalEntry.delivery.receivedAt,
      skewMs,
      evidenceRefs: canonicalEntry.claim.evidenceRefs,
      attestationRef: canonicalEntry.delivery.attestation.attestationId
    });

    const claim: Claim = {
      id: claimId,
      subject,
      property: proposition,
      value: canonicalEntry.claim.value,
      ...(canonicalEntry.claim.unit !== undefined ? { unit: canonicalEntry.claim.unit } : {}),
      state: isLate ? "OBSERVED" : "ATTESTED",
      sourceRefs: [canonicalEntry.delivery.attestation.attestationId],
      evidenceRefs: canonicalEntry.claim.evidenceRefs,
      attestationRefs: [canonicalEntry.delivery.attestation.attestationId],
      observedAt: canonicalEntry.claim.observedAt,
      createdAt: policy.nowMs
    };

    const claimIndex = candidate.claims.findIndex((existing) => existing.id === claimId);
    if (claimIndex >= 0) {
      candidate.claims[claimIndex] = structuredClone(claim);
    } else {
      candidate.claims.push(structuredClone(claim));
    }
  }

  for (const conflict of conflicts) {
    if (!candidate.exceptions.some((exception) => exception.id === conflict.id)) {
      candidate.exceptions.push({
        id: conflict.id,
        objectId,
        type: "EVIDENCE_CONFLICT",
        severity: "BLOCKING",
        affectedClaims: conflict.claimRefs,
        evidence: [],
        detectedAt: conflict.detectedAt,
        status: "OPEN",
        resolutionOptions: conflict.resolutionOptions
      });
    }
  }

  if (conflicts.length > 0) {
    candidate.status = "CONFLICTING";
  }

  candidate.claims = [...candidate.claims].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  candidate.updatedAt = policy.nowMs;

  const synchronizationRoot = deriveSynchronizationRoot(candidate, input.history);

  return {
    objectId,
    candidate,
    admitted: admissions.map((admission) => ({
      deliveryId: admission.deliveryId,
      venueId: admission.venueId,
      status: admission.status,
      reasonCodes: admission.reasonCodes
    })),
    applied,
    conflicts,
    duplicatesDropped,
    temporalSkew,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    synchronizationRoot
  };
}

export function synchronizeEconomicObject(input: SynchronizeInput): SynchronizeResult {
  const reconciliation = reconcileVenueDeliveries(input);
  const currentRecord = input.history.at(-1);
  const baseline = currentRecord?.object ?? input.object;
  const currentHistory =
    input.history.length > 0 ? input.history : initializeVersionHistory(input.object);

  const material = isMaterialEconomicObjectChange(baseline, reconciliation.candidate);
  if (!material) {
    return {
      history: currentHistory,
      created: false,
      current: currentHistory.at(-1)!,
      reconciliation
    };
  }

  const changeId = `sync:${reconciliation.candidate.id}:${reconciliation.synchronizationRoot}`;
  const append = appendEconomicObjectChange(
    currentHistory,
    reconciliation.candidate,
    changeId
  );
  return {
    history: append.history,
    created: append.created,
    current: append.current,
    reconciliation
  };
}