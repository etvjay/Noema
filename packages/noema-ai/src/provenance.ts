import type { Hex, JsonObject, Ref, UnixMillis } from "@noema/economic-kernel";
import { hashCanonical } from "@noema/canonicalization";
import type { NoemaAiProposal, NoemaAiRunReceipt } from "./types.js";
import { noemaAiProposalSchema, noemaAiRunReceiptSchema } from "./schemas.js";

export const PROPOSAL_DOMAIN = "noema:ai-proposal:v1";
export const AI_SCHEMA_VERSION = "noema-ai-schema-v1";
export const DEFAULT_PROMPT_VERSION = "noema-prompt-v1";

export function toProposalHashProjection(
  proposal: Omit<NoemaAiProposal, "proposalHash"> | NoemaAiProposal
): Record<string, unknown> {
  return {
    domain: PROPOSAL_DOMAIN,
    proposalId: proposal.proposalId,
    runId: proposal.runId,
    promptVersion: proposal.promptVersion,
    schemaVersion: proposal.schemaVersion,
    proposedClaims: proposal.proposedClaims,
    proposedRights: proposal.proposedRights,
    proposedRestrictions: proposal.proposedRestrictions,
    proposedRelationships: proposal.proposedRelationships,
    proposedConflicts: proposal.proposedConflicts,
    proposedUnresolvedIssues: proposal.proposedUnresolvedIssues,
    summary: proposal.summary
  };
}

export function hashProposal(
  proposal: Omit<NoemaAiProposal, "proposalHash"> | NoemaAiProposal
): Hex {
  return hashCanonical(toProposalHashProjection(proposal) as JsonObject);
}

export function validateProposal(data: unknown): NoemaAiProposal {
  const parsed = noemaAiProposalSchema.parse(data) as NoemaAiProposal;
  const expectedHash = hashProposal(parsed);
  if (parsed.proposalHash !== expectedHash) {
    throw new Error(
      `Proposal hash mismatch: expected ${expectedHash}, received ${parsed.proposalHash}`
    );
  }
  return parsed;
}

export function validateRunReceipt(data: unknown): NoemaAiRunReceipt {
  return noemaAiRunReceiptSchema.parse(data) as NoemaAiRunReceipt;
}

export interface CreateAiRunReceiptParams {
  runId: Ref;
  modelId: string;
  promptVersion?: string;
  schemaVersion?: string;
  inputSourceRefs: Ref[];
  inputEvidenceRefs: Ref[];
  outputProposalHash: Hex;
  startedAt: UnixMillis;
  completedAt?: UnixMillis;
  inputTokens: number;
  outputTokens: number;
  status?: NoemaAiRunReceipt["status"];
}

export function createAiRunReceipt(params: CreateAiRunReceiptParams): NoemaAiRunReceipt {
  const completedAt = params.completedAt ?? Date.now();
  const latencyMs = Math.max(0, completedAt - params.startedAt);

  const receipt: NoemaAiRunReceipt = {
    runId: params.runId,
    modelId: params.modelId,
    promptVersion: params.promptVersion ?? DEFAULT_PROMPT_VERSION,
    schemaVersion: params.schemaVersion ?? AI_SCHEMA_VERSION,
    inputSourceRefs: [...params.inputSourceRefs],
    inputEvidenceRefs: [...params.inputEvidenceRefs],
    outputProposalHash: params.outputProposalHash,
    latencyMs,
    tokenUsage: {
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens
    },
    status: params.status ?? "SUCCESS",
    timestamps: {
      startedAt: params.startedAt,
      completedAt
    }
  };

  return validateRunReceipt(receipt);
}
