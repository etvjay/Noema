import type { EconomicObject } from "@noema/economic-kernel";

export const REST_CONTRACT_VERSION = "noema-rest-v1";
export const REST_API_PATH_PREFIX = "/noema";

export const NOEMA_ERROR_CODES = [
  "INVALID_REF",
  "MALFORMED_ID",
  "NOT_FOUND",
  "VERSION_NOT_FOUND",
  "LATEST_UNAVAILABLE",
  "INVALID_PAGE",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INTERNAL"
] as const;

export type NoemaErrorCode = (typeof NOEMA_ERROR_CODES)[number];

export interface NoemaRestError {
  status: "ERROR";
  code: NoemaErrorCode;
  message: string;
  resource?: string;
  objectId?: string;
  version?: number;
  ref?: string;
}

export function restError(input: {
  code: NoemaErrorCode;
  message: string;
  resource?: string;
  objectId?: string;
  version?: number;
  ref?: string;
}): NoemaRestError {
  return { status: "ERROR", ...input };
}

export type NoemaResource =
  | "objects"
  | "objectVersion"
  | "objectLatest"
  | "objectHistory"
  | "representations"
  | "evidence"
  | "attestations"
  | "verificationReceipts"
  | "mandates"
  | "decisions"
  | "watches"
  | "semanticEvents"
  | "xlayerCommitments"
  | "health";

export interface RestResourceDefinition {
  id: NoemaResource;
  path: string;
  versioned: boolean;
  immutableExactRef: boolean;
  latestSemantics: boolean;
  canonicalSchema: string;
}

export const REST_RESOURCES: readonly RestResourceDefinition[] = [
  {
    id: "objects",
    path: "/objects",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: true,
    canonicalSchema: "EconomicObject"
  },
  {
    id: "objectVersion",
    path: "/objects/{objectId}/versions/{version}",
    versioned: true,
    immutableExactRef: true,
    latestSemantics: false,
    canonicalSchema: "EconomicObject"
  },
  {
    id: "objectLatest",
    path: "/objects/{objectId}/latest",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: true,
    canonicalSchema: "EconomicObject+LatestSelection"
  },
  {
    id: "objectHistory",
    path: "/objects/{objectId}/versions",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "EconomicObjectVersionRecord[]"
  },
  {
    id: "representations",
    path: "/representations",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: true,
    canonicalSchema: "Representation[]"
  },
  {
    id: "evidence",
    path: "/evidence",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "Evidence[]"
  },
  {
    id: "attestations",
    path: "/attestations",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "Attestation[]"
  },
  {
    id: "verificationReceipts",
    path: "/objects/{objectId}/verification/{version}",
    versioned: true,
    immutableExactRef: true,
    latestSemantics: false,
    canonicalSchema: "VerificationReceipt"
  },
  {
    id: "mandates",
    path: "/mandates",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "Mandate"
  },
  {
    id: "decisions",
    path: "/objects/{objectId}/decisions/{version}",
    versioned: true,
    immutableExactRef: true,
    latestSemantics: false,
    canonicalSchema: "DecisionReceipt"
  },
  {
    id: "watches",
    path: "/watches",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "WatchSubscription"
  },
  {
    id: "semanticEvents",
    path: "/semantic-events",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "SemanticEvent"
  },
  {
    id: "xlayerCommitments",
    path: "/xlayer/commitments",
    versioned: true,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "RegistryCommitment"
  },
  {
    id: "health",
    path: "/health",
    versioned: false,
    immutableExactRef: false,
    latestSemantics: false,
    canonicalSchema: "ServiceStatus"
  }
];

export function resourceDefinition(id: NoemaResource): RestResourceDefinition {
  const def = REST_RESOURCES.find((candidate) => candidate.id === id);
  if (def === undefined) {
    throw restError({ code: "INTERNAL", message: `Unknown REST resource: ${id}` });
  }
  return def;
}

export function exactObjectVersionRef(objectId: string, version: number): string {
  return `objects/${objectId}/versions/${version}`;
}

export function latestObjectRef(objectId: string): string {
  return `objects/${objectId}/latest`;
}

export function parseObjectVersionRef(ref: string):
  | { ok: true; objectId: string; version: number }
  | { ok: false; error: NoemaRestError } {
  if (typeof ref !== "string" || ref.length === 0) {
    return { ok: false, error: restError({ code: "INVALID_REF", message: "Ref must be a non-empty string", ref }) };
  }
  const parts = ref.split("/");
  if (parts.length !== 4 || parts[0] !== "objects" || parts[2] !== "versions") {
    return {
      ok: false,
      error: restError({
        code: "INVALID_REF",
        message: "Ref must have form objects/{objectId}/versions/{version}",
        ref
      })
    };
  }
  const objectId = parts[1];
  const versionText = parts[3];
  if (objectId === undefined || versionText === undefined) {
    return {
      ok: false,
      error: restError({
        code: "INVALID_REF",
        message: "Ref must have form objects/{objectId}/versions/{version}",
        ref
      })
    };
  }
  if (objectId.length === 0 || !/^\d+$/.test(versionText)) {
    return {
      ok: false,
      error: restError({
        code: "MALFORMED_ID",
        message: "objectId must be non-empty and version must be a positive integer",
        ref
      })
    };
  }
  const version = Number(versionText);
  if (!Number.isSafeInteger(version) || version < 1) {
    return {
      ok: false,
      error: restError({ code: "MALFORMED_ID", message: "version must be a positive integer", ref })
    };
  }
  return { ok: true, objectId, version };
}

export function parseObjectId(objectId: string):
  | { ok: true; objectId: string }
  | { ok: false; error: NoemaRestError } {
  if (typeof objectId !== "string" || objectId.length === 0 || objectId.includes("/")) {
    return {
      ok: false,
      error: restError({ code: "MALFORMED_ID", message: "objectId must be a non-empty path-safe string", objectId })
    };
  }
  return { ok: true, objectId };
}

export interface LatestSelectionProof {
  selectedVersion: number;
  repositoryStateRef: string;
  candidateVersions: readonly number[];
  reason: string;
  selectedAtMs: number;
}

export interface LatestObjectResolution {
  object: EconomicObject;
  selection: LatestSelectionProof;
}

export interface ResolveLatestObjectInput {
  objectId: string;
  versions: readonly EconomicObject[];
  repositoryStateRef: string;
  nowMs: number;
}

export function resolveLatestObject(input: ResolveLatestObjectInput):
  | { ok: true; result: LatestObjectResolution }
  | { ok: false; error: NoemaRestError } {
  if (input.versions.length === 0) {
    return {
      ok: false,
      error: restError({
        code: "LATEST_UNAVAILABLE",
        message: `No canonical versions exist for ${input.objectId}`,
        resource: "objects",
        objectId: input.objectId
      })
    };
  }

  const mismatched = input.versions.find((candidate) => candidate.id !== input.objectId);
  if (mismatched !== undefined) {
    return {
      ok: false,
      error: restError({
        code: "INTERNAL",
        message: `Version record ${mismatched.version} belongs to ${mismatched.id}, not ${input.objectId}`,
        resource: "objects",
        objectId: input.objectId
      })
    };
  }

  let latest = input.versions[0]!;
  for (const candidate of input.versions) {
    if (!Number.isSafeInteger(candidate.version) || candidate.version < 1) {
      return {
        ok: false,
        error: restError({
          code: "INTERNAL",
          message: `Version record has invalid version number ${candidate.version}`,
          resource: "objects",
          objectId: input.objectId
        })
      };
    }
    if (candidate.version > latest.version) latest = candidate;
  }

  const candidateVersions = input.versions.map((candidate) => candidate.version).sort((a, b) => a - b);
  return {
    ok: true,
    result: {
      object: latest,
      selection: {
        selectedVersion: latest.version,
        repositoryStateRef: input.repositoryStateRef,
        candidateVersions,
        reason: `Highest canonical object version accepted by repository state ${input.repositoryStateRef}`,
        selectedAtMs: input.nowMs
      }
    }
  };
}

export interface DeterministicCursor {
  afterVersion: number;
  pageSize: number;
  order: "asc" | "desc";
}

export function createDeterministicCursor(input: {
  afterVersion: number;
  pageSize: number;
  order?: "asc" | "desc";
}): { ok: true; cursor: string } | { ok: false; error: NoemaRestError } {
  if (!Number.isSafeInteger(input.afterVersion) || input.afterVersion < 0) {
    return {
      ok: false,
      error: restError({ code: "INVALID_PAGE", message: "afterVersion must be a non-negative integer" })
    };
  }
  if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    return {
      ok: false,
      error: restError({ code: "INVALID_PAGE", message: "pageSize must be between 1 and 100" })
    };
  }
  const order = input.order ?? "desc";
  const token = `${input.afterVersion}|${input.pageSize}|${order}`;
  return { ok: true, cursor: `v1:${Buffer.from(token, "utf8").toString("base64url")}` };
}

export function parseDeterministicCursor(cursor: unknown):
  | { ok: true; cursor: DeterministicCursor }
  | { ok: false; error: NoemaRestError } {
  if (typeof cursor !== "string" || !cursor.startsWith("v1:")) {
    return {
      ok: false,
      error: restError({ code: "INVALID_PAGE", message: "Cursor must be a v1 cursor", ref: String(cursor) })
    };
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor.slice(3), "base64url").toString("utf8");
  } catch {
    return { ok: false, error: restError({ code: "INVALID_PAGE", message: "Cursor is not decodable" }) };
  }
  const [afterText, pageText, order] = decoded.split("|");
  if (afterText === undefined || pageText === undefined || (order !== "asc" && order !== "desc")) {
    return { ok: false, error: restError({ code: "INVALID_PAGE", message: "Cursor fields are malformed" }) };
  }
  const afterVersion = Number(afterText);
  const pageSize = Number(pageText);
  if (!Number.isSafeInteger(afterVersion) || afterVersion < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    return { ok: false, error: restError({ code: "INVALID_PAGE", message: "Cursor values are invalid" }) };
  }
  return { ok: true, cursor: { afterVersion, pageSize, order } };
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function paginateDeterministically<T extends { version: number }>(input: {
  items: readonly T[];
  cursor: DeterministicCursor;
}): { ok: true; page: PageResult<T> } | { ok: false; error: NoemaRestError } {
  const { afterVersion, pageSize, order } = input.cursor;
  const ordered = [...input.items].sort((a, b) =>
    order === "asc" ? a.version - b.version : b.version - a.version
  );
  const filtered = ordered.filter((candidate) =>
    order === "asc" ? candidate.version > afterVersion : candidate.version < afterVersion
  );
  const page = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;
  const nextCursor = hasMore
    ? createDeterministicCursor({ afterVersion: page[page.length - 1]!.version, pageSize, order })
    : null;
  if (nextCursor !== null && !("ok" in nextCursor && nextCursor.ok)) return { ok: false, error: restError({ code: "INTERNAL", message: "Failed to build next cursor" }) };
  return { ok: true, page: { items: page, nextCursor: nextCursor === null ? null : nextCursor.cursor, hasMore } };
}

export type CachePolicy = "immutable" | "no-cache" | "no-store";

export interface CacheDecision {
  policy: CachePolicy;
  cacheControl: string;
  etag: string | null;
  reason: string;
}

export function cachePolicyForExactVersion(version: number): CacheDecision {
  return {
    policy: "immutable",
    cacheControl: `public, max-age=31536000, immutable`,
    etag: `"${REST_CONTRACT_VERSION}:v${version}"`,
    reason: "Exact canonical versions are immutable and replayable"
  };
}

export function cachePolicyForLatest(input: {
  repositoryStateRef: string;
  selectedVersion: number;
}): CacheDecision {
  return {
    policy: "no-cache",
    cacheControl: "no-cache, must-revalidate",
    etag: `"${REST_CONTRACT_VERSION}:latest:${input.repositoryStateRef}:v${input.selectedVersion}"`,
    reason: "latest must always be revalidated against the current repository state"
  };
}

export function latestSelectionMetadata(input: {
  objectId: string;
  selectedVersion: number;
  repositoryStateRef: string;
}): {
  objectId: string;
  exactRef: string;
  latestRef: string;
  selectedVersion: number;
  repositoryStateRef: string;
} {
  return {
    objectId: input.objectId,
    exactRef: exactObjectVersionRef(input.objectId, input.selectedVersion),
    latestRef: latestObjectRef(input.objectId),
    selectedVersion: input.selectedVersion,
    repositoryStateRef: input.repositoryStateRef
  };
}

export interface OpenApiPath {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  auth: "public" | "bearer";
}

export const REST_AUTHORIZATION_MODEL = {
  publicRead: ["objects", "objectVersion", "objectLatest", "objectHistory", "representations", "evidence", "attestations", "verificationReceipts", "mandates", "decisions", "semanticEvents", "xlayerCommitments", "health"],
  bearerRequired: ["watches"]
} as const;

export function openApiPaths(): OpenApiPath[] {
  const methods: Record<NoemaResource, { method: string; summary: string; auth: "public" | "bearer" }> = {
    objects: { method: "GET", summary: "List economic objects (latest by default)", auth: "public" },
    objectVersion: { method: "GET", summary: "Fetch an exact immutable canonical version", auth: "public" },
    objectLatest: { method: "GET", summary: "Fetch the canonical latest version with selection proof", auth: "public" },
    objectHistory: { method: "GET", summary: "List version history deterministically", auth: "public" },
    representations: { method: "GET", summary: "List representations for latest objects", auth: "public" },
    evidence: { method: "GET", summary: "List evidence, deterministic cursors", auth: "public" },
    attestations: { method: "GET", summary: "List attestations, deterministic cursors", auth: "public" },
    verificationReceipts: { method: "GET", summary: "Fetch exact verification receipt", auth: "public" },
    mandates: { method: "GET", summary: "List mandates", auth: "public" },
    decisions: { method: "GET", summary: "Fetch exact decision receipt", auth: "public" },
    watches: { method: "GET", summary: "Manage private watches (bearer required)", auth: "bearer" },
    semanticEvents: { method: "GET", summary: "List semantic events deterministically", auth: "public" },
    xlayerCommitments: { method: "GET", summary: "Inspect X Layer commitment references", auth: "public" },
    health: { method: "GET", summary: "Service health, version, capabilities", auth: "public" }
  };
  return REST_RESOURCES.map((resource) => {
    const spec = methods[resource.id];
    return {
      operationId: `${spec.method.toLowerCase()}-${resource.id}`,
      method: spec.method,
      path: `${REST_API_PATH_PREFIX}${resource.path}`,
      summary: spec.summary,
      auth: spec.auth
    };
  });
}

export interface OpenApiContract {
  openapi: "3.1.0";
  info: {
    title: string;
    version: typeof REST_CONTRACT_VERSION;
    description: string;
  };
  servers: { url: string }[];
  paths: Record<string, unknown>;
  components: {
    securitySchemes: {
      bearerAuth: { type: "http"; scheme: "bearer"; bearerFormat: "JWT" };
    };
  };
}

export function buildOpenApiContract(): OpenApiContract {
  const paths: Record<string, unknown> = {};
  for (const route of openApiPaths()) {
    const pathItem = (paths[route.path] ??= {});
    (pathItem as Record<string, unknown>)[route.method.toLowerCase()] = {
      operationId: route.operationId,
      summary: route.summary,
      tags: [route.auth === "public" ? "public" : "private"],
      responses: {
        "200": { description: "Canonical Noema response (see schema contract)" },
        "404": { description: "Resource not found" },
        "400": { description: "Typed NoemaRestError (invalid ref, malformed id, invalid page)" },
        "401": { description: "Unauthorized" },
        "500": { description: "Internal error (never fake success)" }
      }
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Noema REST Resource Contract",
      version: REST_CONTRACT_VERSION,
      description:
        "Versioned canonical HTTP resource model. latest means the highest canonical EconomicObject version accepted by the current repository state — never the newest raw source fetch, newest block, or newest channel notification."
    },
    servers: [{ url: `${REST_API_PATH_PREFIX}` }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
      }
    }
  };
}