import { z } from "zod";

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

const refSchema = z.string().min(1);
const claimStateSchema = z.enum([
  "UNKNOWN",
  "OBSERVED",
  "SOURCED",
  "ATTESTED",
  "VERIFIED",
  "INFERRED",
  "CONFLICTING",
  "STALE",
  "REVOKED"
]);
const evidenceTypeSchema = z.enum([
  "DOCUMENT",
  "ORACLE",
  "ONCHAIN_STATE",
  "ATTESTATION",
  "API_RESPONSE",
  "FILING",
  "PROOF",
  "OTHER"
]);
const evidenceAuthoritySchema = z.enum([
  "PRIMARY_SOURCE",
  "AUTHORIZED_ATTESTOR",
  "ONCHAIN_STATE",
  "INDEPENDENT_ORACLE",
  "REFERENCE_DATA",
  "MARKET_DATA",
  "DERIVED",
  "AI_INFERENCE",
  "DEMO_FIXTURE"
]);

export const claimSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    property: z.string().min(1),
    value: jsonValueSchema,
    unit: z.string().optional(),
    state: claimStateSchema,
    sourceRefs: z.array(refSchema),
    evidenceRefs: z.array(refSchema),
    attestationRefs: z.array(refSchema),
    confidence: z.number().min(0).max(1).optional(),
    observedAt: z.number().int().nonnegative().optional(),
    validFrom: z.number().int().nonnegative().optional(),
    expiresAt: z.number().int().nonnegative().optional(),
    supersedes: refSchema.optional(),
    createdAt: z.number().int().nonnegative()
  })
  .strict();

export const evidenceSchema = z
  .object({
    id: refSchema,
    type: evidenceTypeSchema,
    source: refSchema,
    contentHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
    locator: z.string().optional(),
    observedAt: z.number().int().nonnegative(),
    fetchedAt: z.number().int().nonnegative(),
    authority: evidenceAuthoritySchema,
    freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]).optional(),
    metadata: z.record(z.string(), jsonValueSchema)
  })
  .strict();

export const economicObjectProjectionSchema = z
  .object({
    id: refSchema,
    version: z.number().int().positive(),
    classification: z.record(z.string(), jsonValueSchema),
    identifiers: z.array(z.record(z.string(), jsonValueSchema)),
    representations: z.array(z.record(z.string(), jsonValueSchema)),
    relationships: z.array(z.record(z.string(), jsonValueSchema)),
    parties: z.array(z.record(z.string(), jsonValueSchema)),
    rights: z.array(z.record(z.string(), jsonValueSchema)),
    obligations: z.array(z.record(z.string(), jsonValueSchema)),
    restrictions: z.array(z.record(z.string(), jsonValueSchema)),
    economics: z.record(z.string(), jsonValueSchema),
    claims: z.array(z.record(z.string(), jsonValueSchema)),
    evidence: z.array(z.record(z.string(), jsonValueSchema)),
    attestations: z.array(z.record(z.string(), jsonValueSchema)),
    exceptions: z.array(z.record(z.string(), jsonValueSchema)),
    provenance: z.record(z.string(), jsonValueSchema),
    status: z.string(),
    verification: z.record(z.string(), jsonValueSchema)
  })
  .strict();

export const sourceSnapshotSchema = z
  .object({
    id: refSchema,
    sourceId: refSchema,
    uri: z.string().url(),
    contentType: z.string().min(1),
    contentHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
    fetchedAt: z.number().int().nonnegative(),
    httpStatus: z.number().int().optional(),
    etag: z.string().optional(),
    lastModified: z.string().optional(),
    bodyStorageRef: refSchema,
    extractionVersion: z.string().optional()
  })
  .strict();

export const mandateSchema = z
  .object({
    id: refSchema,
    version: z.number().int().positive(),
    principal: refSchema,
    objective: z.string().min(1),
    capital: z
      .object({
        currency: z.string().min(1),
        amount: z.string().min(1)
      })
      .strict()
      .optional(),
    allowedAssetClasses: z.array(z.string()),
    prohibitedAssetClasses: z.array(z.string()),
    minYieldBps: z.number().optional(),
    maxRedemptionPeriodMs: z.number().int().nonnegative().optional(),
    maxEvidenceAgeMs: z.number().int().nonnegative().optional(),
    jurisdictions: z.array(z.string()),
    requiredClaims: z.array(
      z
        .object({
          property: z.string().min(1),
          requiredState: claimStateSchema
        })
        .strict()
    ),
    requiredEvidence: z.array(
      z
        .object({
          type: evidenceTypeSchema,
          maxAgeMs: z.number().int().nonnegative().optional()
        })
        .strict()
    ),
    expiresAt: z.number().int().nonnegative().optional()
  })
  .strict();

export const schemas = {
  claim: claimSchema,
  evidence: evidenceSchema,
  economicObjectProjection: economicObjectProjectionSchema,
  sourceSnapshot: sourceSnapshotSchema,
  mandate: mandateSchema
} as const;
