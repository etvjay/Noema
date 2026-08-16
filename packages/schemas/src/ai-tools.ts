import { z } from "zod";
import {
  proposedClaimSchema,
  proposedRelationshipSchema,
  proposedUnresolvedIssueSchema
} from "./ai.js";

export const NOEMA_AI_TOOL_CONTRACT_VERSION = "noema-ai-tools-v1";
export const NOEMA_AI_TOOL_TRANSCRIPT_VERSION = "noema-ai-tool-transcript-v1";

const refSchema = z.string().min(1);
const unixMillisSchema = z.number().int().nonnegative();
const hex32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
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

const objectIdArgsSchema = z.object({ objectId: refSchema }).strict();
const refArgsSchema = z.object({ ref: refSchema }).strict();

export const noemaAiReadToolCallSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("get_source_snapshot"), args: refArgsSchema }).strict(),
  z.object({ name: z.literal("get_claims"), args: objectIdArgsSchema }).strict(),
  z.object({ name: z.literal("get_evidence"), args: objectIdArgsSchema }).strict(),
  z.object({ name: z.literal("get_attestations"), args: objectIdArgsSchema }).strict(),
  z.object({ name: z.literal("get_representation"), args: refArgsSchema }).strict(),
  z
    .object({
      name: z.literal("get_identifier_candidates"),
      args: z.object({ query: z.string().min(1).max(512) }).strict()
    })
    .strict(),
  z
    .object({
      name: z.literal("read_contract_state"),
      args: z
        .object({
          chainId: z.number().int().positive(),
          address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
          selector: z.string().regex(/^0x[0-9a-fA-F]{8}$/),
          calldata: z.string().regex(/^0x[0-9a-fA-F]*$/).optional()
        })
        .strict()
    })
    .strict(),
  z
    .object({
      name: z.literal("get_market_observation"),
      args: z.object({ instrumentRef: refSchema }).strict()
    })
    .strict(),
  z
    .object({
      name: z.literal("get_verification_result"),
      args: z.object({ objectId: refSchema, objectVersion: z.number().int().positive() }).strict()
    })
    .strict()
]);

export const noemaAiProposalToolCallSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("propose_claim"), args: proposedClaimSchema }).strict(),
  z.object({ name: z.literal("propose_relationship"), args: proposedRelationshipSchema }).strict(),
  z.object({ name: z.literal("propose_exception"), args: proposedUnresolvedIssueSchema }).strict()
]);

export const noemaAiToolCallSchema = z.union([
  noemaAiReadToolCallSchema,
  noemaAiProposalToolCallSchema
]);

export const noemaAiToolResultSchema = z
  .object({
    callId: refSchema,
    toolName: z.string().min(1),
    status: z.enum(["SUCCESS", "NOT_FOUND", "REJECTED", "ERROR"]),
    result: jsonValueSchema.optional(),
    sourceRefs: z.array(refSchema),
    contentHashes: z.array(hex32Schema),
    errorCode: z.string().min(1).optional(),
    startedAt: unixMillisSchema,
    completedAt: unixMillisSchema
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
  });

export const noemaAiToolTranscriptEntrySchema = z
  .object({
    transcriptVersion: z.literal(NOEMA_AI_TOOL_TRANSCRIPT_VERSION),
    runId: refSchema,
    callId: refSchema,
    call: noemaAiToolCallSchema,
    result: noemaAiToolResultSchema,
    metadata: jsonObjectSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.callId !== value.result.callId) {
      context.addIssue({ code: "custom", path: ["callId"], message: "callId must match result.callId" });
    }
    if (value.call.name !== value.result.toolName) {
      context.addIssue({
        code: "custom",
        path: ["result", "toolName"],
        message: "tool result name must match requested tool"
      });
    }
  });

export type NoemaAiReadToolCall = z.infer<typeof noemaAiReadToolCallSchema>;
export type NoemaAiProposalToolCall = z.infer<typeof noemaAiProposalToolCallSchema>;
export type NoemaAiToolCall = z.infer<typeof noemaAiToolCallSchema>;
export type NoemaAiToolResult = z.infer<typeof noemaAiToolResultSchema>;
export type NoemaAiToolTranscriptEntry = z.infer<typeof noemaAiToolTranscriptEntrySchema>;
