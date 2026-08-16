import { z } from "zod";
import type { DecisionReceipt, Ref, UnixMillis } from "@noema/economic-kernel";
import type { WatchSubscription } from "@noema/schemas/events";
import { watchSubscriptionSchema } from "@noema/schemas/events";
import {
  createCanonicalEngineTransport,
  createNoemaSdk,
  type CanonicalEngine,
  type NoemaSdk,
  type SdkOperationMap
} from "./sdk.js";
import { toMcpResource } from "./surfaces.js";

export const MCP_CONTRACT_VERSION = "noema-mcp-v1";
export const MCP_SPEC_VERSION = "2026-07-28";
export const MCP_SUPPORTED_SPEC_VERSIONS = ["2026-07-28", "2025-11-25"] as const;

const refSchema = z.string().min(1);
const unixMillisSchema = z.number().int().nonnegative();
const cursorSchema = z.string().min(1);
const pageSizeSchema = z.number().int().positive().max(100).default(20);

const objectRefArgs = z.object({ objectId: refSchema }).strict();
const refArgs = z.object({ ref: refSchema }).strict();
const objectVersionArgs = z.object({ objectId: refSchema, version: z.number().int().positive() }).strict();

export type McpPermission = "read" | "watch" | "evaluate";

export interface McpToolDefinition {
  name: string;
  description: string;
  permission: McpPermission;
  inputSchema: z.ZodType;
}

export type McpToolResultStatus = "SUCCESS" | "NOT_FOUND" | "REJECTED" | "ERROR";

export interface McpToolResult {
  callId: Ref;
  toolName: string;
  status: McpToolResultStatus;
  result?: unknown;
  sourceRefs: Ref[];
  contentHashes: string[];
  errorCode?: string;
  startedAt: UnixMillis;
  completedAt: UnixMillis;
}

export interface McpAuditEntry {
  auditVersion: typeof MCP_CONTRACT_VERSION;
  runId: Ref;
  callId: Ref;
  toolName: string;
  permission: McpPermission;
  args: Record<string, unknown>;
  status: McpToolResultStatus;
  sourceRefs: Ref[];
  contentHashes: string[];
  errorCode?: string;
  startedAt: UnixMillis;
  completedAt: UnixMillis;
}

export interface McpResourceDefinition {
  uriTemplate: string;
  mimeType: "application/vnd.noema.snapshot+json";
  schemaVersion: typeof MCP_CONTRACT_VERSION;
}

export interface McpResourceContent {
  uri: string;
  mimeType: "application/vnd.noema.snapshot+json";
  text: string;
}

export interface NoemaMcpServerOptions {
  engine: CanonicalEngine;
  permissions?: Partial<Record<McpPermission, boolean>>;
  runId: Ref;
  now?: () => number;
}

export interface NoemaMcpServer {
  protocolVersion(): { spec: string; supported: readonly string[]; contract: string };
  listTools(): McpToolDefinition[];
  callTool(input: { name: string; args: unknown; callId?: Ref }): Promise<McpToolResult>;
  listResources(): McpResourceDefinition[];
  readResource(uri: string): Promise<McpResourceContent | { status: "NOT_FOUND"; uri: string }>;
  auditTrace(): readonly McpAuditEntry[];
}

const HEX64 = /^0x[0-9a-fA-F]{64}$/;

function extractContentHashes(value: unknown, seen = new Set<string>()): string[] {
  if (value === null || typeof value !== "object") return [];
  if (typeof value === "string") {
    if (HEX64.test(value) && !seen.has(value)) {
      seen.add(value);
      return [value];
    }
    return [];
  }
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) out.push(...extractContentHashes(item, seen));
  } else {
    for (const entry of Object.entries(value)) out.push(...extractContentHashes(entry[1], seen));
  }
  return out;
}

export const noemaMcpTools: readonly McpToolDefinition[] = [
  {
    name: "resolve_object",
    description: "Resolve the latest canonical version of an EconomicObject from repository state.",
    permission: "read",
    inputSchema: z.object({ objectId: refSchema, repositoryStateRef: refSchema }).strict()
  },
  {
    name: "get_object_version",
    description: "Get an exact immutable EconomicObject version by its canonical ref.",
    permission: "read",
    inputSchema: refArgs
  },
  {
    name: "list_object_versions",
    description: "List canonical versions of an object with deterministic pagination.",
    permission: "read",
    inputSchema: z
      .object({
        objectId: refSchema,
        cursor: cursorSchema.optional(),
        pageSize: pageSizeSchema.optional(),
        order: z.enum(["asc", "desc"]).optional()
      })
      .strict()
  },
  {
    name: "compare_objects",
    description: "Compare two immutable versions of the same object by canonical verification roots.",
    permission: "read",
    inputSchema: z.object({ leftRef: refSchema, rightRef: refSchema }).strict()
  },
  {
    name: "list_evidence",
    description: "List evidence for an object (or all evidence) with exact IDs and content hashes.",
    permission: "read",
    inputSchema: objectRefArgs
  },
  {
    name: "get_evidence",
    description: "Get a single Evidence record by exact id.",
    permission: "read",
    inputSchema: z.object({ id: refSchema }).strict()
  },
  {
    name: "list_attestations",
    description: "List attestation summaries for an object (or all) with exact ids and claim refs.",
    permission: "read",
    inputSchema: objectRefArgs
  },
  {
    name: "get_attestations",
    description: "Get a single attestation summary by exact id.",
    permission: "read",
    inputSchema: z.object({ id: refSchema }).strict()
  },
  {
    name: "get_verification_receipt",
    description: "Get the canonical VerificationReceipt for an object version.",
    permission: "read",
    inputSchema: objectVersionArgs
  },
  {
    name: "evaluate_mandate",
    description: "Evaluate a mandate against the latest verified object; returns a DecisionReceipt. Never mutates canonical state.",
    permission: "evaluate",
    inputSchema: z.object({ objectId: refSchema, mandateId: refSchema, nowMs: unixMillisSchema }).strict()
  },
  {
    name: "get_decision_receipt",
    description: "Get the DecisionReceipt for an object version.",
    permission: "read",
    inputSchema: objectVersionArgs
  },
  {
    name: "explain_decision",
    description: "Explain a decision by its DecisionReceipt ref with reason codes and policy checks.",
    permission: "read",
    inputSchema: z.object({ decisionReceiptRef: refSchema }).strict()
  },
  {
    name: "create_watch",
    description: "Create a watch subscription. Subscriptions must not embed destination secrets.",
    permission: "watch",
    inputSchema: z.object({ subscription: watchSubscriptionSchema }).strict()
  },
  {
    name: "get_watch",
    description: "Get a watch subscription by id.",
    permission: "watch",
    inputSchema: z.object({ subscriptionId: refSchema }).strict()
  },
  {
    name: "list_watches",
    description: "List watch subscriptions with deterministic pagination.",
    permission: "watch",
    inputSchema: z
      .object({ cursor: cursorSchema.optional(), pageSize: pageSizeSchema.optional() })
      .strict()
  },
  {
    name: "delete_watch",
    description: "Delete a watch subscription by id.",
    permission: "watch",
    inputSchema: z.object({ subscriptionId: refSchema }).strict()
  },
  {
    name: "list_events",
    description: "List canonical semantic events with deterministic pagination.",
    permission: "read",
    inputSchema: z
      .object({ cursor: cursorSchema.optional(), pageSize: pageSizeSchema.optional() })
      .strict()
  },
  {
    name: "get_event",
    description: "Get a single canonical semantic event by eventId.",
    permission: "read",
    inputSchema: z.object({ eventId: refSchema }).strict()
  },
  {
    name: "get_commitment",
    description: "Get the registry commitment for an object (X Layer commitment ref when bound).",
    permission: "read",
    inputSchema: objectRefArgs
  }
];

type ToolHandler = (args: Record<string, unknown>, sdk: NoemaSdk) => Promise<{
  result?: unknown;
  sourceRefs: Ref[];
  contentHashes: string[];
}>;

function toStatus(status: string): McpToolResultStatus {
  return status === "SUCCESS" ? "SUCCESS" : "NOT_FOUND";
}

const noemaMcpHandlers: Record<string, ToolHandler> = {
  resolve_object: async (args, sdk) => {
    const res = await sdk.objects.latest({
      objectId: args.objectId as Ref,
      repositoryStateRef: args.repositoryStateRef as Ref
    });
    if (!res.ok) throw res.error;
    const ref = `${res.value.object.id}/versions/${res.value.selection.selectedVersion}`;
    return { result: res.value, sourceRefs: [ref], contentHashes: extractContentHashes(res.value.object) };
  },
  get_object_version: async (args, sdk) => {
    const res = await sdk.objects.get(args.ref as string);
    if (!res.ok) throw res.error;
    return { result: res.value, sourceRefs: [args.ref as string], contentHashes: extractContentHashes(res.value) };
  },
  list_object_versions: async (args, sdk) => {
    const input: SdkOperationMap["objects.versionHistory"]["input"] = {
      objectId: args.objectId as Ref
    };
    if (args.cursor !== undefined) input.cursor = args.cursor as string;
    if (args.pageSize !== undefined) input.pageSize = args.pageSize as number;
    if (args.order !== undefined) input.order = args.order as "asc" | "desc";
    const res = await sdk.objects.versionHistory(input);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: res.value.items.map((item) => `${item.id}/versions/${item.version}`),
      contentHashes: res.value.items.flatMap((item) => extractContentHashes(item))
    };
  },
  compare_objects: async (args, sdk) => {
    const res = await sdk.objects.compare({
      leftRef: args.leftRef as string,
      rightRef: args.rightRef as string
    });
    if (!res.ok) throw res.error;
    return { result: res.value, sourceRefs: [args.leftRef as string, args.rightRef as string], contentHashes: [] };
  },
  list_evidence: async (args, sdk) => {
    const res = await sdk.evidence.list(args.objectId as Ref | undefined);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: res.value.map((item) => item.id),
      contentHashes: res.value.map((item) => item.contentHash)
    };
  },
  get_evidence: async (args, sdk) => {
    const res = await sdk.evidence.get(args.id as Ref);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.id, res.value.source],
      contentHashes: [res.value.contentHash]
    };
  },
  list_attestations: async (args, sdk) => {
    const res = await sdk.attestations.list(args.objectId as Ref | undefined);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: res.value.map((item) => item.id),
      contentHashes: []
    };
  },
  get_attestations: async (args, sdk) => {
    const res = await sdk.attestations.get(args.id as Ref);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.id, res.value.claimRef],
      contentHashes: []
    };
  },
  get_verification_receipt: async (args, sdk) => {
    const res = await sdk.verification.get({
      objectId: args.objectId as Ref,
      version: args.version as number
    });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [`${res.value.objectId}/versions/${res.value.objectVersion}`],
      contentHashes: [res.value.objectRoot, res.value.evidenceRoot]
    };
  },
  evaluate_mandate: async (args, sdk) => {
    const res = await sdk.mandates.evaluate({
      objectId: args.objectId as Ref,
      mandateId: args.mandateId as Ref,
      nowMs: args.nowMs as UnixMillis
    });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.id, res.value.objectId, res.value.mandateId],
      contentHashes: [res.value.evidenceRoot]
    };
  },
  get_decision_receipt: async (args, sdk) => {
    const res = await sdk.decisions.get({
      objectId: args.objectId as Ref,
      version: args.version as number
    });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.id, `${res.value.objectId}/versions/${res.value.objectVersion}`],
      contentHashes: [res.value.evidenceRoot]
    };
  },
  explain_decision: async (args, sdk) => {
    const res = await sdk.decisions.explainReference({ decisionReceiptRef: args.decisionReceiptRef as Ref });
    if (!res.ok) throw res.error;
    return { result: res.value, sourceRefs: [res.value.decisionReceiptRef], contentHashes: [] };
  },
  create_watch: async (args, sdk) => {
    const subscription = args.subscription as WatchSubscription;
    const res = await sdk.watches.create({ subscription });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.subscriptionId, res.value.watchId, res.value.objectId],
      contentHashes: []
    };
  },
  get_watch: async (args, sdk) => {
    const res = await sdk.watches.get({ subscriptionId: args.subscriptionId as Ref });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.subscriptionId, res.value.watchId, res.value.objectId],
      contentHashes: []
    };
  },
  list_watches: async (args, sdk) => {
    const input: SdkOperationMap["watches.list"]["input"] = {};
    if (args.cursor !== undefined) input.cursor = args.cursor as string;
    if (args.pageSize !== undefined) input.pageSize = args.pageSize as number;
    const res = await sdk.watches.list(input);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: res.value.items.map((item) => item.subscriptionId),
      contentHashes: []
    };
  },
  delete_watch: async (args, sdk) => {
    const res = await sdk.watches.delete({ subscriptionId: args.subscriptionId as Ref });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.subscriptionId],
      contentHashes: []
    };
  },
  list_events: async (args, sdk) => {
    const input: SdkOperationMap["events.list"]["input"] = {};
    if (args.cursor !== undefined) input.cursor = args.cursor as string;
    if (args.pageSize !== undefined) input.pageSize = args.pageSize as number;
    const res = await sdk.events.list(input);
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: res.value.items.map((item) => item.eventId),
      contentHashes: res.value.items.flatMap((item) => extractContentHashes(item))
    };
  },
  get_event: async (args, sdk) => {
    const res = await sdk.events.get({ eventId: args.eventId as Ref });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.eventId],
      contentHashes: extractContentHashes(res.value)
    };
  },
  get_commitment: async (args, sdk) => {
    const res = await sdk.commitments.get({ objectId: args.objectId as Ref });
    if (!res.ok) throw res.error;
    return {
      result: res.value,
      sourceRefs: [res.value.objectId],
      contentHashes: [res.value.objectRoot, res.value.evidenceRoot]
    };
  }
};

const noemaMcpResources: readonly McpResourceDefinition[] = [
  {
    uriTemplate: "noema://objects/{objectId}/latest",
    mimeType: "application/vnd.noema.snapshot+json",
  schemaVersion: MCP_CONTRACT_VERSION
  },
  {
    uriTemplate: "noema://objects/{objectId}/versions/{version}",
    mimeType: "application/vnd.noema.snapshot+json",
  schemaVersion: MCP_CONTRACT_VERSION
  },
  {
    uriTemplate: "noema://objects/{objectId}/verification/{version}",
    mimeType: "application/vnd.noema.snapshot+json",
  schemaVersion: MCP_CONTRACT_VERSION
  },
  {
    uriTemplate: "noema://events/{eventId}",
    mimeType: "application/vnd.noema.snapshot+json",
  schemaVersion: MCP_CONTRACT_VERSION
  }
];

export function createNoemaMcpServer(options: NoemaMcpServerOptions): NoemaMcpServer {
  const permissions: Record<McpPermission, boolean> = {
    read: options.permissions?.read ?? true,
    watch: options.permissions?.watch ?? true,
    evaluate: options.permissions?.evaluate ?? true
  };
  const sdk = createNoemaSdk(createCanonicalEngineTransport(options.engine));
  const now = options.now ?? (() => Date.now());
  const runId = options.runId;
  const audit: McpAuditEntry[] = [];

  const toolByName = new Map(noemaMcpTools.map((tool) => [tool.name, tool]));

  function permissionFor(name: string): McpPermission | undefined {
    return toolByName.get(name)?.permission;
  }

  function record(entry: McpAuditEntry): void {
    audit.push(entry);
  }

  return {
    protocolVersion() {
      return {
        spec: MCP_SPEC_VERSION,
        supported: MCP_SUPPORTED_SPEC_VERSIONS,
        contract: MCP_CONTRACT_VERSION
      };
    },
    listTools() {
      return noemaMcpTools.filter((tool) => permissions[tool.permission]);
    },
    async callTool(input): Promise<McpToolResult> {
      const startedAt = now();
      const callId = input.callId ?? `${runId}:${startedAt}:${input.name}`;
      const tool = toolByName.get(input.name);
      const args = input.args as Record<string, unknown> | undefined;

      if (tool === undefined) {
        const completedAt = now();
        const entry: McpAuditEntry = {
          auditVersion: MCP_CONTRACT_VERSION,
          runId,
          callId,
          toolName: input.name,
          permission: "read",
          args: args ?? {},
          status: "REJECTED",
          sourceRefs: [],
          contentHashes: [],
          errorCode: "UNKNOWN_TOOL",
          startedAt,
          completedAt
        };
        record(entry);
        return {
          callId,
          toolName: input.name,
          status: "REJECTED",
          sourceRefs: [],
          contentHashes: [],
          errorCode: "UNKNOWN_TOOL",
          startedAt,
          completedAt
        };
      }

      if (!permissions[tool.permission]) {
        const completedAt = now();
        const entry: McpAuditEntry = {
          auditVersion: MCP_CONTRACT_VERSION,
          runId,
          callId,
          toolName: input.name,
          permission: tool.permission,
          args: args ?? {},
          status: "REJECTED",
          sourceRefs: [],
          contentHashes: [],
          errorCode: "PERMISSION_DENIED",
          startedAt,
          completedAt
        };
        record(entry);
        return {
          callId,
          toolName: input.name,
          status: "REJECTED",
          sourceRefs: [],
          contentHashes: [],
          errorCode: "PERMISSION_DENIED",
          startedAt,
          completedAt
        };
      }

      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        const completedAt = now();
        const entry: McpAuditEntry = {
          auditVersion: MCP_CONTRACT_VERSION,
          runId,
          callId,
          toolName: input.name,
          permission: tool.permission,
          args: args ?? {},
          status: "REJECTED",
          sourceRefs: [],
          contentHashes: [],
          errorCode: "VALIDATION_ERROR",
          startedAt,
          completedAt
        };
        record(entry);
        return {
          callId,
          toolName: input.name,
          status: "REJECTED",
          sourceRefs: [],
          contentHashes: [],
          errorCode: "VALIDATION_ERROR",
          startedAt,
          completedAt
        };
      }

      try {
        const handler = noemaMcpHandlers[tool.name];
        if (handler === undefined) {
          throw { code: "INTERNAL", message: `No handler for tool ${tool.name}` };
        }
        const { result, sourceRefs, contentHashes } = await handler(parsed.data as Record<string, unknown>, sdk);
        const completedAt = now();
        const entry: McpAuditEntry = {
          auditVersion: MCP_CONTRACT_VERSION,
          runId,
          callId,
          toolName: input.name,
          permission: tool.permission,
          args: parsed.data as Record<string, unknown>,
          status: "SUCCESS",
          sourceRefs,
          contentHashes,
          startedAt,
          completedAt
        };
        record(entry);
        return {
          callId,
          toolName: input.name,
          status: "SUCCESS",
          result,
          sourceRefs,
          contentHashes,
          startedAt,
          completedAt
        };
      } catch (error) {
        const completedAt = now();
        const err = error as { code?: string; message?: string };
        const code = err.code ?? "ERROR";
        const status: McpToolResultStatus = code === "VERSION_NOT_FOUND" || code === "NOT_FOUND" ? "NOT_FOUND" : "ERROR";
        const entry: McpAuditEntry = {
          auditVersion: MCP_CONTRACT_VERSION,
          runId,
          callId,
          toolName: input.name,
          permission: tool.permission,
          args: parsed.data as Record<string, unknown>,
          status,
          sourceRefs: [],
          contentHashes: [],
          errorCode: code,
          startedAt,
          completedAt
        };
        record(entry);
        return {
          callId,
          toolName: input.name,
          status,
          sourceRefs: [],
          contentHashes: [],
          errorCode: code,
          startedAt,
          completedAt
        };
      }
    },
    listResources() {
      return [...noemaMcpResources];
    },
    async readResource(uri): Promise<McpResourceContent | { status: "NOT_FOUND"; uri: string }> {
      const latest = /^noema:\/\/objects\/([^/]+)\/latest$/.exec(uri);
      const version = /^noema:\/\/objects\/([^/]+)\/versions\/(\d+)$/.exec(uri);
      const verification = /^noema:\/\/objects\/([^/]+)\/verification\/(\d+)$/.exec(uri);
      const event = /^noema:\/\/events\/([^/]+)$/.exec(uri);

      const objectId = latest?.[1] ?? version?.[1] ?? verification?.[1];
      const versionNumber = version?.[2] !== undefined ? Number(version[2]) : verification?.[2] !== undefined ? Number(verification[2]) : undefined;
      const eventId = event?.[1];

      if (objectId !== undefined) {
        const versions = options.engine.objectVersions(objectId);
        if (versions.length === 0) return { status: "NOT_FOUND", uri };
        if (versionNumber !== undefined) {
          const object = versions.find((candidate) => candidate.version === versionNumber);
          if (object === undefined) return { status: "NOT_FOUND", uri };
          const verificationReceipt = options.engine.verifyReceiptFor(objectId, object.version);
          const decision = options.engine.decisionReceiptFor(objectId, object.version);
          if (verificationReceipt === undefined) return { status: "NOT_FOUND", uri };
          const resource = toMcpResource({
            object,
            verification: verificationReceipt,
            decision: decision ?? EMPTY_DECISION
          });
          return { uri, mimeType: "application/vnd.noema.snapshot+json", text: JSON.stringify(resource) };
        }
        const object = versions[versions.length - 1]!;
        const verificationReceipt = options.engine.verifyReceiptFor(objectId, object.version);
        const decision = options.engine.decisionReceiptFor(objectId, object.version);
        if (verificationReceipt === undefined) return { status: "NOT_FOUND", uri };
        const resource = toMcpResource({
          object,
          verification: verificationReceipt,
          decision: decision ?? EMPTY_DECISION
        });
        return { uri, mimeType: "application/vnd.noema.snapshot+json", text: JSON.stringify(resource) };
      }

      if (eventId !== undefined) {
        const event = options.engine.events().find((candidate) => candidate.eventId === eventId);
        if (event === undefined) return { status: "NOT_FOUND", uri };
        return {
          uri,
          mimeType: "application/vnd.noema.snapshot+json",
          text: JSON.stringify({ uri, event })
        };
      }

      return { status: "NOT_FOUND", uri };
    },
    auditTrace() {
      return audit.slice();
    }
  };
}

const EMPTY_DECISION: DecisionReceipt = {
  id: "no-decision",
  schemaId: "noema:decision-receipt",
  schemaVersion: 1,
  objectId: "",
  objectVersion: 0,
  mandateId: "no-mandate",
  mandateVersion: 0,
  decision: "BLOCK",
  reasonCodes: ["NO_DECISION"],
  policyChecks: [],
  supportingClaims: [],
  evidenceRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
  verificationReceiptRef: "no-verification",
  policyEngineVersion: "noema-policy-v1",
  createdAt: 0
};

export function mcpProtocolVersion(): { spec: string; supported: readonly string[]; contract: string } {
  return { spec: MCP_SPEC_VERSION, supported: MCP_SUPPORTED_SPEC_VERSIONS, contract: MCP_CONTRACT_VERSION };
}
