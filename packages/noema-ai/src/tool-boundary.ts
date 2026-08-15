import type {
  Attestation,
  Claim,
  Evidence,
  Hex,
  JsonObject,
  JsonValue,
  Ref,
  Representation,
  SourceSnapshot,
  VerificationReceipt
} from "@noema/economic-kernel";
import { hashUtf8 } from "@noema/canonicalization";
import type {
  NoemaAiProposal,
  ProposedClaim,
  ProposedConflict,
  ProposedRelationship
} from "./types.js";
import { hashProposal } from "./provenance.js";

export interface InstructionNeutralEnvelope<T = unknown> {
  type: "DATA_LITERAL_ONLY";
  contentHash: Hex;
  byteLength: number;
  isInstructionIsolated: true;
  payload: T;
}

export function wrapInInstructionNeutralEnvelope<T>(
  raw: T
): InstructionNeutralEnvelope<T> {
  const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
  return {
    type: "DATA_LITERAL_ONLY",
    contentHash: hashUtf8(serialized),
    byteLength: Buffer.byteLength(serialized, "utf8"),
    isInstructionIsolated: true,
    payload: raw
  };
}

export interface NoemaAiEnvironment {
  sourceSnapshots?: readonly SourceSnapshot[];
  evidence?: readonly Evidence[];
  attestations?: readonly Attestation[];
  representations?: readonly Representation[];
  claims?: readonly Claim[];
  verificationReceipts?: readonly VerificationReceipt[];
  contractState?: Record<string, JsonValue>;
  marketObservations?: Record<string, JsonValue>;
}

export class NoemaAiToolBoundary {
  private readonly sources = new Map<Ref, SourceSnapshot>();
  private readonly evidenceMap = new Map<Ref, Evidence>();
  private readonly attestations = new Map<Ref, Attestation>();
  private readonly representations = new Map<Ref, Representation>();
  private readonly claims = new Map<Ref, Claim>();
  private readonly verifications = new Map<Ref, VerificationReceipt>();
  private readonly contractState: Record<string, JsonValue>;
  private readonly marketObservations: Record<string, JsonValue>;

  // Draft proposal accumulation (write-proposal only, not canonical state)
  private draftClaims: ProposedClaim[] = [];
  private draftRelationships: ProposedRelationship[] = [];
  private draftConflicts: ProposedConflict[] = [];

  constructor(env: NoemaAiEnvironment) {
    for (const s of env.sourceSnapshots ?? []) this.sources.set(s.id, s);
    for (const e of env.evidence ?? []) this.evidenceMap.set(e.id, e);
    for (const a of env.attestations ?? []) this.attestations.set(a.id, a);
    for (const r of env.representations ?? []) this.representations.set(r.id, r);
    for (const c of env.claims ?? []) this.claims.set(c.id, c);
    for (const v of env.verificationReceipts ?? []) this.verifications.set(v.id, v);
    this.contractState = { ...(env.contractState ?? {}) };
    this.marketObservations = { ...(env.marketObservations ?? {}) };
  }

  // --- READ-ONLY SAFE TOOLS ---

  public get_source_snapshot(id: Ref): InstructionNeutralEnvelope<SourceSnapshot | null> {
    const src = this.sources.get(id) ?? null;
    return wrapInInstructionNeutralEnvelope(src);
  }

  public get_evidence(id: Ref): InstructionNeutralEnvelope<Evidence | null> {
    const ev = this.evidenceMap.get(id) ?? null;
    return wrapInInstructionNeutralEnvelope(ev);
  }

  public get_claims(subject?: Ref): InstructionNeutralEnvelope<Claim[]> {
    const list = Array.from(this.claims.values()).filter(
      (c) => !subject || c.subject === subject
    );
    return wrapInInstructionNeutralEnvelope(list);
  }

  public get_attestations(claimRef?: Ref): InstructionNeutralEnvelope<Attestation[]> {
    const list = Array.from(this.attestations.values()).filter(
      (a) => !claimRef || a.claimRef === claimRef
    );
    return wrapInInstructionNeutralEnvelope(list);
  }

  public get_representation(id: Ref): InstructionNeutralEnvelope<Representation | null> {
    const rep = this.representations.get(id) ?? null;
    return wrapInInstructionNeutralEnvelope(rep);
  }

  public get_identifier_candidates(subject: Ref): InstructionNeutralEnvelope<string[]> {
    const claims = Array.from(this.claims.values()).filter((c) => c.subject === subject);
    const ids: string[] = [];
    for (const c of claims) {
      if (["cusip", "isin", "ticker", "lei", "cik"].includes(c.property) && typeof c.value === "string") {
        ids.push(`${c.property}:${c.value}`);
      }
    }
    return wrapInInstructionNeutralEnvelope(ids);
  }

  public read_contract_state(key: string): InstructionNeutralEnvelope<JsonValue | null> {
    const val = this.contractState[key] ?? null;
    return wrapInInstructionNeutralEnvelope(val);
  }

  public get_market_observation(subject: Ref): InstructionNeutralEnvelope<JsonValue | null> {
    const obs = this.marketObservations[subject] ?? null;
    return wrapInInstructionNeutralEnvelope(obs);
  }

  public get_verification_result(receiptId: Ref): InstructionNeutralEnvelope<VerificationReceipt | null> {
    const rec = this.verifications.get(receiptId) ?? null;
    return wrapInInstructionNeutralEnvelope(rec);
  }

  // --- WRITE-PROPOSAL TOOLS (ONLY APPEND TO PROPOSAL DRAFT) ---

  public propose_claim(claim: ProposedClaim): { status: "PROPOSED"; claimId: Ref } {
    this.draftClaims.push({ ...claim });
    return { status: "PROPOSED", claimId: claim.id };
  }

  public propose_relationship(rel: ProposedRelationship): { status: "PROPOSED"; relationshipId: Ref } {
    this.draftRelationships.push({ ...rel });
    return { status: "PROPOSED", relationshipId: rel.id };
  }

  public propose_conflict(conflict: ProposedConflict): { status: "PROPOSED"; conflictId: Ref } {
    this.draftConflicts.push({ ...conflict });
    return { status: "PROPOSED", conflictId: conflict.id };
  }

  // Finalize proposal
  public exportDraftProposal(params: {
    proposalId: Ref;
    runId: Ref;
    summary: string;
    createdAt?: number;
  }): NoemaAiProposal {
    const rawProposal: Omit<NoemaAiProposal, "proposalHash"> = {
      proposalId: params.proposalId,
      runId: params.runId,
      promptVersion: "noema-prompt-v1",
      schemaVersion: "noema-ai-schema-v1",
      proposedClaims: [...this.draftClaims],
      proposedRights: [],
      proposedRestrictions: [],
      proposedRelationships: [...this.draftRelationships],
      proposedConflicts: [...this.draftConflicts],
      proposedUnresolvedIssues: [],
      summary: params.summary,
      createdAt: params.createdAt ?? Date.now()
    };

    const hash = hashProposal(rawProposal);
    return {
      ...rawProposal,
      proposalHash: hash
    };
  }
}
