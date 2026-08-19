export interface AttestorMap {
  [venueId: string]: string;
}

export interface BenchFixtureCase {
  id: string;
  label: string;
  description: string;
  object: Record<string, unknown>;
  deliveries: unknown[];
  phases?: unknown[][];
  policy: Record<string, unknown>;
  permute: boolean;
  expect: Record<string, unknown>;
  evidenceIndex?: Record<string, Record<string, unknown>>;
}

export interface BenchFixture {
  fixtureVersion: string;
  frozenAt: string;
  protocolVersion: string;
  description: string;
  attestors: AttestorMap;
  cases: BenchFixtureCase[];
}

export interface PhaseRun {
  deliveryOrder: string[];
  created: boolean;
  synchronizationRoot: string;
  finalVersion: number;
  finalStatus: string;
  admittedCount: number;
  rejectedCount: number;
  appliedCount: number;
  conflicts: number;
  duplicatesDropped: number;
  appliedStates: string[];
  reasonCodes: string[];
}

export interface OrderingRun {
  caseId: string;
  deliveryOrder: string[];
  phaseCount: number;
  phases: PhaseRun[];
  created: boolean;
  synchronizationRoot: string;
  finalVersion: number;
  finalStatus: string;
  admitted: number;
  rejected: number;
  applied: number;
  conflicts: number;
  duplicatesDropped: number;
  appliedStates: string[];
  reasonCodes: string[];
}

export interface BenchMetrics {
  caseCount: number;
  orderInvarianceRate: number;
  deterministicReplayRate: number;
  duplicateIdempotencyRate: number;
  silentConflictLossRate: number;
  unauthorizedScopePromotionRate: number;
  spuriousVersionRate: number;
  staleHandledRate: number;
  revocationHandledRate: number;
  reorgHandledRate: number;
  lateVisibleRate: number;
  supersededHandledRate: number;
}

export interface Counterexample {
  caseId: string;
  fixtureVersion: string;
  failingOrdering: string[];
  observed: Array<{
    deliveryOrder: string[];
    admitted: number;
    applied: number;
    conflicts: number;
    created: boolean;
    synchronizationRoot: string;
    finalStatus: string;
  }>;
}

export function loadFixture(path: string): BenchFixture;
export function permuteDeliveries(deliveries: unknown[], seed: number): unknown[];
export function orderingsFor(deliveries: unknown[]): unknown[][];
export function runOrdering(
  caseDef: BenchFixtureCase,
  orderings: unknown[] | unknown[][],
  policy: Record<string, unknown>,
  synchronize: (input: unknown) => unknown
): Promise<OrderingRun>;
export function deriveMetrics(fixture: BenchFixture, runs: OrderingRun[]): BenchMetrics;
export function counterexamplesFor(fixture: BenchFixture, runs: OrderingRun[]): Counterexample[];
export function degradedSynchronize(input: unknown): Record<string, unknown>;