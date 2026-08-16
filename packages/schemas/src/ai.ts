import { createHash } from "node:crypto";
import { z } from "zod";
import { relationshipTypeSchema } from "./index.js";

export const NOEMA_AI_PROPOSAL_SCHEMA_VERSION = "noema-ai-proposal-v1";
export const NOEMA_AI_RUN_SCHEMA_VERSION = "noema-ai-run-v1";
export const NOEMA_AI_PROPOSAL_HASH_VERSION = "noema-ai-proposal-sha256-v1";

const refSchema = z.string().min(1);
const unixMillisSchema = z.number().int().nonnegative();
const confidenceSchema = z.number().min(0).max(1);
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const aiEvidenceLocatorSchema = z
  .object({
    sourceSnapshotRef: refSchema,
    evidenceRef: refSchema,
    locator: z.string().min(1)
  })
  .strict();

export const proposedClaimSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    property: z.string().min(1),
    value: jsonValueSchema,
    unit: z.string().min(1).optional(),
    basis: z.enum(["DIRECT_STATEMENT", "INFERRED"]),
    confidence: confidenceSchema,
    evidence: z.array(aiEvidenceLocatorSchema).min(1),
    explanation: z.string().min(1).optional()
  })
  .strict();

export const proposedRightSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    type: z.string().min(1),
    terms: jsonObjectSchema,
    confidence: confidenceSchema,
    evidence: z.array(aiEvidenceLocatorSchema).min(1),
    supportingClaimRefs: z.array(refSchema),
    unresolvedDimensions: z.array(z.string().min(1))
  })
  .strict();

export const proposedRestrictionSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    type: z.string().min(1),
    scope: z.string().min(1),
    terms: jsonObjectSchema,
    confidence: confidenceSchema,
    evidence: z.array(aiEvidenceLocatorSchema).min(1),
    supportingClaimRefs: z.array(refSchema),
    unresolvedDimensions: z.array(z.string().min(1))
  })
  .strict();

export const proposedRelationshipSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    predicate: relationshipTypeSchema,
    object: refSchema,
    confidence: confidenceSchema,
    evidence: z.array(aiEvidenceLocatorSchema).min(1),
    supportingClaimRefs: z.array(refSchema),
    comparedDimensions: z.array(z.string().min(1)),
    unresolvedDimensions: z.array(z.string().min(1)),
    explanation: z.string().min(1).optional()
  })
  .strict();

export const proposedConflictSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    property: z.string().min(1),
    conflictType: z.enum([
      "VALUE_MISMATCH",
      "IDENTITY_MISMATCH",
      "RIGHTS_MISMATCH",
      "RESTRICTION_MISMATCH",
      "RELATIONSHIP_MISMATCH",
      "EFFECTIVE_DATE_MISMATCH",
      "SCOPE_MISMATCH",
      "AUTHORITY_MISMATCH",
      "OTHER"
    ]),
    evidence: z.array(aiEvidenceLocatorSchema).min(2),
    likelyCause: z.string().min(1).optional(),
    confidence: confidenceSchema
  })
  .strict();

export const proposedUnresolvedIssueSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    property: z.string().min(1),
    reasonCode: z.string().min(1),
    evidence: z.array(aiEvidenceLocatorSchema),
    requiredEvidence: z.array(z.string().min(1)),
    explanation: z.string().min(1).optional()
  })
  .strict();

export const noemaAiProposalSchema = z
  .object({
    schemaVersion: z.literal(NOEMA_AI_PROPOSAL_SCHEMA_VERSION),
    proposalId: refSchema,
    sourceSnapshotRefs: z.array(refSchema),
    evidenceRefs: z.array(refSchema),
    claims: z.array(proposedClaimSchema),
    rights: z.array(proposedRightSchema),
    restrictions: z.array(proposedRestrictionSchema),
    relationships: z.array(proposedRelationshipSchema),
    conflicts: z.array(proposedConflictSchema),
    unresolvedIssues: z.array(proposedUnresolvedIssueSchema)
  })
  .strict();

export const noemaAiTokenUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative()
  })
  .strict();

export const noemaAiRunReceiptSchema = z
  .object({
    schemaVersion: z.literal(NOEMA_AI_RUN_SCHEMA_VERSION),
    runId: refSchema,
    model: z.string().min(1),
    modelVersion: z.string().min(1).optional(),
    promptVersion: z.string().min(1),
    proposalSchemaVersion: z.literal(NOEMA_AI_PROPOSAL_SCHEMA_VERSION),
    inputSourceSnapshotRefs: z.array(refSchema),
    inputEvidenceRefs: z.array(refSchema),
    outputProposalHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    proposalHashVersion: z.literal(NOEMA_AI_PROPOSAL_HASH_VERSION),
    latencyMs: z.number().int().nonnegative(),
    tokenUsage: noemaAiTokenUsageSchema,
    status: z.enum(["SUCCESS", "REJECTED", "ERROR"]),
    startedAt: unixMillisSchema,
    completedAt: unixMillisSchema,
    errorCode: z.string().min(1).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.completedAt < value.startedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "completedAt must be greater than or equal to startedAt"
      });
    }
    if (value.tokenUsage.totalTokens !== value.tokenUsage.inputTokens + value.tokenUsage.outputTokens) {
      context.addIssue({
        code: "custom",
        path: ["tokenUsage", "totalTokens"],
        message: "totalTokens must equal inputTokens + outputTokens"
      });
    }
  });

export type AiEvidenceLocator = z.infer<typeof aiEvidenceLocatorSchema>;
export type ProposedClaim = z.infer<typeof proposedClaimSchema>;
export type ProposedRight = z.infer<typeof proposedRightSchema>;
export type ProposedRestriction = z.infer<typeof proposedRestrictionSchema>;
export type ProposedRelationship = z.infer<typeof proposedRelationshipSchema>;
export type ProposedConflict = z.infer<typeof proposedConflictSchema>;
export type ProposedUnresolvedIssue = z.infer<typeof proposedUnresolvedIssueSchema>;
export type NoemaAiProposal = z.infer<typeof noemaAiProposalSchema>;
export type NoemaAiRunReceipt = z.infer<typeof noemaAiRunReceiptSchema>;

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("AI proposal cannot contain non-finite numbers");
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("AI proposal contains an unsupported value");
  return encoded;
}

export function proposalHashProjection(proposal: NoemaAiProposal): Record<string, unknown> {
  const parsed = noemaAiProposalSchema.parse(proposal);
  return {
    domain: "noema:ai-proposal:v1",
    hashVersion: NOEMA_AI_PROPOSAL_HASH_VERSION,
    schemaVersion: parsed.schemaVersion,
    proposalId: parsed.proposalId,
    sourceSnapshotRefs: [...parsed.sourceSnapshotRefs].sort(),
    evidenceRefs: [...parsed.evidenceRefs].sort(),
    claims: [...parsed.claims].sort((a, b) => a.id.localeCompare(b.id)),
    rights: [...parsed.rights].sort((a, b) => a.id.localeCompare(b.id)),
    restrictions: [...parsed.restrictions].sort((a, b) => a.id.localeCompare(b.id)),
    relationships: [...parsed.relationships].sort((a, b) => a.id.localeCompare(b.id)),
    conflicts: [...parsed.conflicts].sort((a, b) => a.id.localeCompare(b.id)),
    unresolvedIssues: [...parsed.unresolvedIssues].sort((a, b) => a.id.localeCompare(b.id))
  };
}

export function hashNoemaAiProposal(proposal: NoemaAiProposal): `0x${string}` {
  const digest = createHash("sha256")
    .update(canonical(proposalHashProjection(proposal)), "utf8")
    .digest("hex");
  return `0x${digest}`;
}
