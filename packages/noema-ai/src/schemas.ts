import { z } from "zod";
import { RELATIONSHIP_TYPES, EXCEPTION_TYPES } from "@noema/economic-kernel";

export const jsonValueSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema)
  ])
);

export const proposedClaimSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  property: z.string().min(1),
  value: jsonValueSchema,
  unit: z.string().optional(),
  confidence: z.number().min(0).max(1),
  isDirect: z.boolean(),
  sourceRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  locator: z.string().optional(),
  explanation: z.string().optional()
});

export const proposedRightSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  holderType: z.enum(["LEGAL_OWNER", "BENEFICIAL_OWNER", "RECORD_HOLDER", "TOKEN_HOLDER"]),
  rightType: z.enum(["REDEMPTION", "INCOME", "VOTING", "INFORMATION", "CONVERSION", "OTHER"]),
  terms: z.string().min(1),
  transferability: z.enum(["TRANSFERABLE", "RESTRICTED", "NON_TRANSFERABLE"]),
  redemptionWindow: z.string().optional(),
  claimRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  locator: z.string().optional(),
  confidence: z.number().min(0).max(1),
  explanation: z.string().optional()
});

export const proposedRestrictionSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  restrictionType: z.enum(["ELIGIBILITY", "JURISDICTION", "LOCKUP", "TRANSFER_RESTRICTION", "SANCTION"]),
  jurisdiction: z.string().optional(),
  eligibilityCriteria: z.string().optional(),
  claimRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  locator: z.string().optional(),
  confidence: z.number().min(0).max(1),
  explanation: z.string().optional()
});

export const proposedRelationshipSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.enum(RELATIONSHIP_TYPES),
  object: z.string().min(1),
  rationale: z.string().min(1),
  claimRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  locator: z.string().optional(),
  confidence: z.number().min(0).max(1),
  isEquivalent: z.boolean().optional()
});

export const proposedConflictSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  property: z.string().min(1),
  description: z.string().min(1),
  likelyCause: z.enum([
    "EFFECTIVE_DATE_MISMATCH",
    "SHARE_CLASS_MISMATCH",
    "REPRESENTATION_MISMATCH",
    "JURISDICTION_MISMATCH",
    "STALE_SOURCE",
    "UNKNOWN_AUTHORITY",
    "OTHER"
  ]),
  conflictingClaimRefs: z.array(z.string().min(1)),
  conflictingEvidenceRefs: z.array(z.string().min(1)),
  severity: z.enum(["INFO", "WARNING", "BLOCKING"])
});

export const proposedUnresolvedIssueSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  issueType: z.enum(EXCEPTION_TYPES),
  description: z.string().min(1),
  missingEvidenceType: z.string().optional(),
  ambiguityDimension: z.string().optional()
});

export const hexSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const noemaAiProposalSchema = z.object({
  proposalId: z.string().min(1),
  runId: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  proposedClaims: z.array(proposedClaimSchema),
  proposedRights: z.array(proposedRightSchema),
  proposedRestrictions: z.array(proposedRestrictionSchema),
  proposedRelationships: z.array(proposedRelationshipSchema),
  proposedConflicts: z.array(proposedConflictSchema),
  proposedUnresolvedIssues: z.array(proposedUnresolvedIssueSchema),
  summary: z.string(),
  proposalHash: hexSchema,
  createdAt: z.number().int().nonnegative()
});

export const noemaAiRunReceiptSchema = z.object({
  runId: z.string().min(1),
  modelId: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  inputSourceRefs: z.array(z.string().min(1)),
  inputEvidenceRefs: z.array(z.string().min(1)),
  outputProposalHash: hexSchema,
  latencyMs: z.number().nonnegative(),
  tokenUsage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative()
  }),
  status: z.enum(["SUCCESS", "REJECTED_MALFORMED", "REJECTED_TIMEOUT", "REJECTED_SECURITY"]),
  timestamps: z.object({
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative()
  })
});
