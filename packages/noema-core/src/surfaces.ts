import type {
  Claim,
  DecisionReceipt,
  EconomicObject,
  Evidence,
  Mandate,
  MandateDecision,
  Ref,
  ResolutionException,
  UnixMillis,
  VerificationReceipt
} from "@noema/economic-kernel";
import { computeRoots } from "@noema/canonicalization";
import { verifyEconomicObject } from "@noema/verification";
import { evaluateMandate } from "./mandate.js";
import { AppendOnlyVersionStore } from "./versioning.js";
import { traceEvidenceLineage } from "./lineage.js";

export interface RestApiResponse<T> {
  data: T;
  meta: {
    serverVersion: string;
    timestamp: UnixMillis;
    correlationId: string;
  };
}

export interface RestApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    serverVersion: string;
    timestamp: UnixMillis;
  };
}

export class NoemaRestServer {
  constructor(
    private readonly versionStore: AppendOnlyVersionStore,
    private readonly mandates: Map<Ref, Mandate> = new Map()
  ) {}

  getObject(id: Ref, version?: number, correlationId = "req-001"): RestApiResponse<EconomicObject> {
    const object = version !== undefined ? this.versionStore.get(id, version) : this.versionStore.getLatest(id);
    if (!object) {
      throw new Error(`OBJECT_NOT_FOUND: Object ${id} not found in store`);
    }
    return {
      data: object,
      meta: {
        serverVersion: "noema-rest-v1",
        timestamp: Date.now(),
        correlationId
      }
    };
  }

  verifyObject(id: Ref, nowMs: UnixMillis = Date.now(), correlationId = "req-002"): RestApiResponse<VerificationReceipt> {
    const object = this.versionStore.getLatest(id);
    if (!object) {
      throw new Error(`OBJECT_NOT_FOUND: Object ${id} not found`);
    }
    const receipt = verifyEconomicObject(object, { nowMs });
    return {
      data: receipt,
      meta: {
        serverVersion: "noema-rest-v1",
        timestamp: nowMs,
        correlationId
      }
    };
  }

  evaluateMandate(
    objectId: Ref,
    mandateId: Ref,
    nowMs: UnixMillis = Date.now(),
    correlationId = "req-003"
  ): RestApiResponse<DecisionReceipt> {
    const object = this.versionStore.getLatest(objectId);
    if (!object) {
      throw new Error(`OBJECT_NOT_FOUND: Object ${objectId} not found`);
    }
    const mandate = this.mandates.get(mandateId);
    if (!mandate) {
      throw new Error(`MANDATE_NOT_FOUND: Mandate ${mandateId} not found`);
    }
    const verification = verifyEconomicObject(object, { nowMs });
    const decision = evaluateMandate(object, verification, mandate, { nowMs });
    return {
      data: decision,
      meta: {
        serverVersion: "noema-rest-v1",
        timestamp: nowMs,
        correlationId
      }
    };
  }
}

export class NoemaSdk {
  constructor(private readonly restServer: NoemaRestServer) {}

  async getEconomicObject(id: Ref, version?: number): Promise<EconomicObject> {
    const res = this.restServer.getObject(id, version);
    return res.data;
  }

  async verify(id: Ref, nowMs?: UnixMillis): Promise<VerificationReceipt> {
    const res = this.restServer.verifyObject(id, nowMs);
    return res.data;
  }

  async evaluate(objectId: Ref, mandateId: Ref, nowMs?: UnixMillis): Promise<DecisionReceipt> {
    const res = this.restServer.evaluateMandate(objectId, mandateId, nowMs);
    return res.data;
  }
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export class NoemaMcpServer {
  constructor(
    private readonly versionStore: AppendOnlyVersionStore,
    private readonly mandates: Map<Ref, Mandate> = new Map()
  ) {}

  listTools() {
    return [
      {
        name: "noema_get_object",
        description: "Retrieve canonical EconomicObject by ID and optional version",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            version: { type: "number" }
          },
          required: ["id"]
        }
      },
      {
        name: "noema_verify_object",
        description: "Run deterministic verification over canonical EconomicObject",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            nowMs: { type: "number" }
          },
          required: ["id"]
        }
      },
      {
        name: "noema_evaluate_mandate",
        description: "Run deterministic mandate policy evaluation over verified EconomicObject",
        inputSchema: {
          type: "object",
          properties: {
            objectId: { type: "string" },
            mandateId: { type: "string" },
            nowMs: { type: "number" }
          },
          required: ["objectId", "mandateId"]
        }
      }
    ];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    try {
      if (name === "noema_get_object") {
        const id = args["id"] as Ref;
        const version = args["version"] as number | undefined;
        const object = version !== undefined ? this.versionStore.get(id, version) : this.versionStore.getLatest(id);
        if (!object) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: `Object ${id} not found` }) }]
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(object) }]
        };
      }

      if (name === "noema_verify_object") {
        const id = args["id"] as Ref;
        const nowMs = (args["nowMs"] as UnixMillis) ?? Date.now();
        const object = this.versionStore.getLatest(id);
        if (!object) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: `Object ${id} not found` }) }]
          };
        }
        const receipt = verifyEconomicObject(object, { nowMs });
        return {
          content: [{ type: "text", text: JSON.stringify(receipt) }]
        };
      }

      if (name === "noema_evaluate_mandate") {
        const objectId = args["objectId"] as Ref;
        const mandateId = args["mandateId"] as Ref;
        const nowMs = (args["nowMs"] as UnixMillis) ?? Date.now();
        const object = this.versionStore.getLatest(objectId);
        if (!object) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: `Object ${objectId} not found` }) }]
          };
        }
        const mandate = this.mandates.get(mandateId);
        if (!mandate) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: `Mandate ${mandateId} not found` }) }]
          };
        }
        const verification = verifyEconomicObject(object, { nowMs });
        const decision = evaluateMandate(object, verification, mandate, { nowMs });
        return {
          content: [{ type: "text", text: JSON.stringify(decision) }]
        };
      }

      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool ${name}` }) }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: err?.message ?? String(err) }) }]
      };
    }
  }
}

export interface ExternalMcpRawOutput {
  status: "OK" | "TIMEOUT" | "AUTH_FAILED" | "UPSTREAM_ERROR";
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export function normalizeExternalMcpResponse(
  raw: ExternalMcpRawOutput,
  sourceRef: Ref,
  observedAt: UnixMillis
): { evidence?: Evidence; exception?: ResolutionException } {
  if (raw.status !== "OK" || !raw.data) {
    return {
      exception: {
        id: `exception:external-mcp:${Date.now()}`,
        objectId: "object:unresolved",
        type: "SOURCE_FAILURE",
        severity: "BLOCKING",
        affectedClaims: [],
        evidence: [],
        detectedAt: observedAt,
        status: "OPEN"
      }
    };
  }

  // External MCP raw data terminates as raw unverified Evidence record
  const content = JSON.stringify(raw.data);
  return {
    evidence: {
      id: `evidence:mcp:${sourceRef}:${observedAt}`,
      type: "API_RESPONSE",
      source: sourceRef,
      observedAt,
      fetchedAt: observedAt,
      authority: "REFERENCE_DATA",
      freshness: "FRESH",
      contentHash: `0x${Buffer.from(content).toString("hex").padEnd(64, "0").slice(0, 64)}`,
      metadata: {}
    }
  };
}
