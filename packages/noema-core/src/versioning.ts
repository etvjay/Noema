import type { EconomicObject } from "@noema/economic-kernel";
import { noemaSchemaRegistry } from "@noema/schemas";

export interface EconomicObjectVersionRecord {
  object: EconomicObject;
  changeId: string;
  supersedesVersion?: number;
  material: boolean;
}

export interface VersionAppendResult {
  history: EconomicObjectVersionRecord[];
  created: boolean;
  current: EconomicObjectVersionRecord;
}

function sortedById<T extends { id: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function materialProjection(object: EconomicObject): unknown {
  return {
    id: object.id,
    classification: object.classification,
    identifiers: object.identifiers,
    representations: sortedById(object.representations),
    relationships: sortedById(object.relationships),
    parties: sortedById(object.parties),
    rights: sortedById(object.rights),
    obligations: sortedById(object.obligations),
    restrictions: sortedById(object.restrictions),
    economics: object.economics,
    claims: sortedById(object.claims).map(({ createdAt: _createdAt, observedAt: _observedAt, ...claim }) => claim),
    evidence: sortedById(object.evidence).map(({ fetchedAt: _fetchedAt, observedAt: _observedAt, ...evidence }) => evidence),
    attestations: sortedById(object.attestations),
    exceptions: sortedById(object.exceptions).map(({ detectedAt: _detectedAt, ...exception }) => exception),
    provenance: {
      edges: sortedById(object.provenance.edges)
    },
    verification: {
      status: object.verification.status,
      verifierVersion: object.verification.verifierVersion,
      objectRoot: object.verification.objectRoot,
      evidenceRoot: object.verification.evidenceRoot,
      checks: sortedById(object.verification.checks).map(({ timestamp: _timestamp, ...check }) => check)
    },
    status: object.status
  };
}

function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isMaterialEconomicObjectChange(
  previous: EconomicObject,
  candidate: EconomicObject
): boolean {
  if (previous.id !== candidate.id) return true;
  return canonical(materialProjection(previous)) !== canonical(materialProjection(candidate));
}

export function initializeVersionHistory(
  object: EconomicObject,
  changeId = "initial"
): EconomicObjectVersionRecord[] {
  noemaSchemaRegistry.decode(object);
  return [
    {
      object: structuredClone(object),
      changeId,
      material: true
    }
  ];
}

export function appendEconomicObjectChange(
  history: readonly EconomicObjectVersionRecord[],
  candidate: EconomicObject,
  changeId: string
): VersionAppendResult {
  noemaSchemaRegistry.decode(candidate);
  const previousRecord = history.at(-1);
  if (previousRecord === undefined) {
    const initialized = initializeVersionHistory(candidate, changeId);
    return { history: initialized, created: true, current: initialized[0]! };
  }

  const previous = previousRecord.object;
  if (previous.id !== candidate.id) {
    throw new Error(`Candidate ${candidate.id} does not belong to history for ${previous.id}`);
  }

  if (!isMaterialEconomicObjectChange(previous, candidate)) {
    const stableHistory = structuredClone([...history]);
    return {
      history: stableHistory,
      created: false,
      current: stableHistory.at(-1)!
    };
  }

  const next: EconomicObject = structuredClone(candidate);
  next.version = previous.version + 1;
  const record: EconomicObjectVersionRecord = {
    object: next,
    changeId,
    supersedesVersion: previous.version,
    material: true
  };
  const nextHistory = [...structuredClone([...history]), record];
  return {
    history: nextHistory,
    created: true,
    current: record
  };
}