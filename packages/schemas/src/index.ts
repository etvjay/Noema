import { z } from "zod";
import {
  SCHEMA_IDS,
  SCHEMA_VERSIONS,
  SchemaRegistry,
  SchemaValidationError,
  UnsupportedSchemaError,
  versionedFromZod
} from "./registry.js";
import { MigrationRegistry, migrationReceiptSchema } from "./migration.js";

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
const refSchema = z.string().min(1);
const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/);
const unixMillisSchema = z.number().int().nonnegative();
const schemaIdSchema = z.string().min(1);
const schemaVersionSchema = z.number().int().positive();

export const claimStateSchema = z.enum([
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

export const evidenceTypeSchema = z.enum([
  "DOCUMENT",
  "ORACLE",
  "ONCHAIN_STATE",
  "ATTESTATION",
  "API_RESPONSE",
  "FILING",
  "PROOF",
  "OTHER"
]);

export const evidenceAuthoritySchema = z.enum([
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

export const verificationOutcomeSchema = z.enum(["PASS", "FAIL", "UNRESOLVED"]);

export const economicObjectStateSchema = z.enum([
  "RESOLVED",
  "PARTIALLY_RESOLVED",
  "CONFLICTING",
  "STALE",
  "INSUFFICIENT_EVIDENCE",
  "REVOKED",
  "UNSUPPORTED"
]);

export const relationshipTypeSchema = z.enum([
  "REPRESENTS",
  "BRIDGED_REPRESENTATION_OF",
  "WRAPPED_REPRESENTATION_OF",
  "SHARE_CLASS_OF",
  "CLAIM_ON",
  "ISSUED_BY",
  "BACKED_BY",
  "CUSTODIED_BY",
  "REDEEMABLE_FOR",
  "DERIVATIVE_OF",
  "COLLATERALIZED_BY",
  "GUARANTEED_BY",
  "FUNCTIONALLY_FUNGIBLE_WITH",
  "ECONOMICALLY_EQUIVALENT_TO",
  "SIMILAR_EXPOSURE_TO",
  "SUPERSEDES"
]);

export const exceptionTypeSchema = z.enum([
  "EVIDENCE_STALE",
  "EVIDENCE_CONFLICT",
  "EVIDENCE_MISSING",
  "IDENTITY_AMBIGUOUS",
  "RELATIONSHIP_AMBIGUOUS",
  "ATTESTATION_REVOKED",
  "SOURCE_FAILURE",
  "VERIFICATION_FAILED",
  "POLICY_AMBIGUOUS",
  "UNSUPPORTED_REPRESENTATION"
]);

export const externalIdentifierSchema = z
  .object({
    scheme: z.enum(["CAIP19", "DTI", "ISIN", "CUSIP", "CONTRACT", "ISSUER", "CUSTOM"]),
    value: z.string().min(1),
    namespace: z.string().optional(),
    source: refSchema,
    status: claimStateSchema
  })
  .strict();

export const economicClassificationSchema = z
  .object({
    primary: z.string().min(1),
    secondary: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    claimRef: refSchema
  })
  .strict();

export const representationSchema = z
  .object({
    id: refSchema,
    environment: z.enum(["EVM", "SOLANA", "CANTON", "OFFCHAIN", "OTHER"]),
    network: z.string().optional(),
    contract: z.string().optional(),
    tokenStandard: z.string().optional(),
    identifiers: z.array(externalIdentifierSchema),
    relationshipToObject: refSchema,
    status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED", "UNKNOWN"]),
    evidence: z.array(refSchema)
  })
  .strict();

export const economicRelationshipSchema = z
  .object({
    id: refSchema,
    subject: refSchema,
    predicate: relationshipTypeSchema,
    object: refSchema,
    state: claimStateSchema,
    evidence: z.array(refSchema),
    attestations: z.array(refSchema),
    inferredBy: refSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    observedAt: unixMillisSchema.optional(),
    validFrom: unixMillisSchema.optional(),
    validUntil: unixMillisSchema.optional()
  })
  .strict();

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
    observedAt: unixMillisSchema.optional(),
    validFrom: unixMillisSchema.optional(),
    expiresAt: unixMillisSchema.optional(),
    supersedes: refSchema.optional(),
    createdAt: unixMillisSchema
  })
  .strict();

export const evidenceSchema = z
  .object({
    id: refSchema,
    schemaId: z.literal(SCHEMA_IDS.EVIDENCE),
    schemaVersion: z.literal(SCHEMA_VERSIONS.EVIDENCE),
    type: evidenceTypeSchema,
    source: refSchema,
    contentHash: hexSchema,
    locator: z.string().optional(),
    observedAt: unixMillisSchema,
    fetchedAt: unixMillisSchema,
    authority: evidenceAuthoritySchema,
    freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]).optional(),
    metadata: jsonObjectSchema
  })
  .strict();

export const attestationSchema = z
  .object({
    id: refSchema,
    schemaId: z.literal(SCHEMA_IDS.ATTESTATION),
    schemaVersion: z.literal(SCHEMA_VERSIONS.ATTESTATION),
    subject: refSchema,
    claimRef: refSchema,
    schema: z.string().min(1),
    attestor: refSchema,
    evidenceRoot: hexSchema.optional(),
    signature: hexSchema,
    issuedAt: unixMillisSchema,
    expiresAt: unixMillisSchema.optional(),
    revokedAt: unixMillisSchema.optional(),
    state: z.enum(["ACTIVE", "EXPIRED", "REVOKED"])
  })
  .strict();

export const economicPartySchema = z
  .object({
    id: refSchema,
    role: z.string().min(1),
    name: z.string().min(1),
    identifiers: z.array(externalIdentifierSchema),
    claimRefs: z.array(refSchema)
  })
  .strict();

export const economicRightSchema = z
  .object({
    id: refSchema,
    type: z.string().min(1),
    holder: refSchema.optional(),
    terms: jsonObjectSchema,
    claimRefs: z.array(refSchema)
  })
  .strict();

export const economicObligationSchema = z
  .object({
    id: refSchema,
    type: z.string().min(1),
    obligor: refSchema.optional(),
    terms: jsonObjectSchema,
    claimRefs: z.array(refSchema)
  })
  .strict();

export const restrictionSchema = z
  .object({
    id: refSchema,
    type: z.string().min(1),
    scope: z.string().min(1),
    claimRefs: z.array(refSchema),
    evidenceRefs: z.array(refSchema)
  })
  .strict();

export const economicStateSchema = z
  .object({
    asOf: unixMillisSchema,
    values: jsonObjectSchema,
    claimRefs: z.array(refSchema)
  })
  .strict();

export const provenanceEdgeSchema = z
  .object({
    id: refSchema,
    from: refSchema,
    to: refSchema,
    relation: z.string().min(1)
  })
  .strict();

export const provenanceGraphSchema = z
  .object({
    edges: z.array(provenanceEdgeSchema)
  })
  .strict();

export const resolutionExceptionSchema = z
  .object({
    id: refSchema,
    objectId: refSchema,
    type: exceptionTypeSchema,
    severity: z.enum(["INFO", "WARNING", "BLOCKING"]),
    affectedClaims: z.array(refSchema),
    evidence: z.array(refSchema),
    detectedAt: unixMillisSchema,
    status: z.enum(["OPEN", "RESOLVED", "SUPERSEDED", "WAIVED"]),
    resolutionOptions: z.array(z.string()).optional()
  })
  .strict();

export const verificationCheckSchema = z
  .object({
    id: refSchema,
    type: z.string().min(1),
    subject: refSchema,
    result: verificationOutcomeSchema,
    evidence: z.array(refSchema),
    ruleVersion: z.string().min(1),
    timestamp: unixMillisSchema,
    reason: z.string().optional()
  })
  .strict();

export const verificationSummarySchema = z
  .object({
    status: verificationOutcomeSchema,
    verifierVersion: z.string().min(1),
    checks: z.array(verificationCheckSchema),
    objectRoot: hexSchema.optional(),
    evidenceRoot: hexSchema.optional()
  })
  .strict();

export const economicObjectProjectionSchema = z
  .object({
    id: refSchema,
    version: z.number().int().positive(),
    schemaId: schemaIdSchema,
    schemaVersion: schemaVersionSchema,
    classification: economicClassificationSchema,
    identifiers: z.array(externalIdentifierSchema),
    representations: z.array(representationSchema),
    relationships: z.array(economicRelationshipSchema),
    parties: z.array(economicPartySchema),
    rights: z.array(economicRightSchema),
    obligations: z.array(economicObligationSchema),
    restrictions: z.array(restrictionSchema),
    economics: economicStateSchema,
    claims: z.array(claimSchema),
    evidence: z.array(evidenceSchema),
    attestations: z.array(attestationSchema),
    exceptions: z.array(resolutionExceptionSchema),
    provenance: provenanceGraphSchema,
    status: economicObjectStateSchema,
    verification: verificationSummarySchema
  })
  .strict();

export const sourceSnapshotSchema = z
  .object({
    id: refSchema,
    schemaId: schemaIdSchema,
    schemaVersion: schemaVersionSchema,
    sourceId: refSchema,
    uri: z.string().url(),
    contentType: z.string().min(1),
    contentHash: hexSchema,
    fetchedAt: unixMillisSchema,
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
    expiresAt: unixMillisSchema.optional()
  })
  .strict();

export const economicObjectSchema = economicObjectProjectionSchema.extend({
  createdAt: unixMillisSchema,
  updatedAt: unixMillisSchema
});

export const policyCheckSchema = z
  .object({
    ruleId: refSchema,
    result: verificationOutcomeSchema,
    claimRefs: z.array(refSchema),
    evidenceRefs: z.array(refSchema),
    reasonCode: z.string().min(1)
  })
  .strict();

export const verificationReceiptSchema = z
  .object({
    id: refSchema,
    schemaId: schemaIdSchema,
    schemaVersion: schemaVersionSchema,
    objectId: refSchema,
    objectVersion: z.number().int().positive(),
    verifierVersion: z.string().min(1),
    hashingVersion: z.string().min(1),
    evidenceRoot: hexSchema,
    objectRoot: hexSchema,
    checks: z.array(verificationCheckSchema),
    overallStatus: verificationOutcomeSchema,
    createdAt: unixMillisSchema
  })
  .strict();

export const decisionReceiptSchema = z
  .object({
    id: refSchema,
    schemaId: schemaIdSchema,
    schemaVersion: schemaVersionSchema,
    objectId: refSchema,
    objectVersion: z.number().int().positive(),
    mandateId: refSchema,
    mandateVersion: z.number().int().positive(),
    decision: z.enum(["ALLOW", "BLOCK", "CONDITIONAL"]),
    reasonCodes: z.array(z.string()),
    policyChecks: z.array(policyCheckSchema),
    supportingClaims: z.array(refSchema),
    evidenceRoot: hexSchema,
    verificationReceiptRef: refSchema,
    policyEngineVersion: z.string().min(1),
    createdAt: unixMillisSchema
  })
  .strict();

export const schemas = {
  claim: claimSchema,
  evidence: evidenceSchema,
  economicObjectProjection: economicObjectProjectionSchema,
  economicObject: economicObjectSchema,
  sourceSnapshot: sourceSnapshotSchema,
  attestation: attestationSchema,
  verificationReceipt: verificationReceiptSchema,
  decisionReceipt: decisionReceiptSchema,
  mandate: mandateSchema
} as const;

export { SCHEMA_IDS, SCHEMA_VERSIONS } from "./registry.js";
export type { VersionedSchema } from "./registry.js";
export {
  SchemaRegistry,
  SchemaValidationError,
  UnsupportedSchemaError,
  versionedFromZod
} from "./registry.js";

export {
  AmbiguousMigrationError,
  MIGRATION_HOP_BOUND,
  MigrationCycleError,
  MigrationDowngradeError,
  MigrationError,
  MigrationGapError,
  MigrationPathError,
  MigrationRegistry,
  NO_OP_MIGRATION_ID,
  detectMigrationCycle,
  migrateArtifact,
  migrationReceiptSchema
} from "./migration.js";
export type {
  MigrationEdge,
  MigrationResult,
  MigrationSummary,
  MigrationTraceStep,
  VersionedArtifact
} from "./migration.js";

export const noemaSchemaRegistry = new SchemaRegistry()
  .register(
    versionedFromZod(SCHEMA_IDS.ECONOMIC_OBJECT, SCHEMA_VERSIONS.ECONOMIC_OBJECT, economicObjectSchema)
  )
  .register(versionedFromZod(SCHEMA_IDS.EVIDENCE, SCHEMA_VERSIONS.EVIDENCE, evidenceSchema))
  .register(
    versionedFromZod(SCHEMA_IDS.SOURCE_SNAPSHOT, SCHEMA_VERSIONS.SOURCE_SNAPSHOT, sourceSnapshotSchema)
  )
  .register(versionedFromZod(SCHEMA_IDS.ATTESTATION, SCHEMA_VERSIONS.ATTESTATION, attestationSchema))
  .register(
    versionedFromZod(
      SCHEMA_IDS.VERIFICATION_RECEIPT,
      SCHEMA_VERSIONS.VERIFICATION_RECEIPT,
      verificationReceiptSchema
    )
  )
  .register(
    versionedFromZod(SCHEMA_IDS.DECISION_RECEIPT, SCHEMA_VERSIONS.DECISION_RECEIPT, decisionReceiptSchema)
  )
  .register(
    versionedFromZod(
      SCHEMA_IDS.MIGRATION_RECEIPT,
      SCHEMA_VERSIONS.MIGRATION_RECEIPT,
      migrationReceiptSchema
    )
  );

export const noemaMigrationRegistry = new MigrationRegistry(noemaSchemaRegistry);
