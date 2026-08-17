import { SCHEMA_IDS, SCHEMA_VERSIONS } from "@noema/schemas";
import { isIP } from "node:net";
import type { Ref, SourceSnapshot, UnixMillis } from "@noema/economic-kernel";
import {
  SOURCE_ADAPTER_VERSION,
  hashBytes,
  sourceFailure,
  stableStorageRef,
  type SourceAdapterResult
} from "../shared.js";

export interface HttpSourcePolicy {
  timeoutMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
  allowedContentTypes: string[];
  allowPrivateHosts?: string[];
}

export interface HttpFetchResponse {
  status: number;
  url: string;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
  redirects?: string[];
}

export type HttpFetcher = (
  url: string,
  options: { timeoutMs: number; maxResponseBytes: number; maxRedirects: number }
) => Promise<HttpFetchResponse>;

export type HostResolver = (hostname: string) => Promise<string[]>;

export interface CaptureHttpSourceInput {
  sourceId: Ref;
  url: string;
  fetchedAt: UnixMillis;
  policy: HttpSourcePolicy;
  fetcher: HttpFetcher;
  resolveHost: HostResolver;
}

function privateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function privateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return privateIpv4(address);
  if (version === 6) return privateIpv6(address);
  return false;
}

function contentTypeAllowed(value: string, allowed: readonly string[]): boolean {
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return allowed.some((candidate) => candidate.toLowerCase() === mediaType);
}

export async function captureHttpSource(
  input: CaptureHttpSourceInput
): Promise<SourceAdapterResult> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return sourceFailure(input.sourceId, input.url, "INVALID_SOURCE", "Source URL is invalid", input.fetchedAt);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return sourceFailure(
      input.sourceId,
      input.url,
      "UNSUPPORTED_PROTOCOL",
      `Unsupported source protocol ${parsed.protocol}`,
      input.fetchedAt
    );
  }

  const explicitlyAllowed = (input.policy.allowPrivateHosts ?? []).includes(parsed.hostname);
  if (!explicitlyAllowed) {
    const addresses = isIP(parsed.hostname)
      ? [parsed.hostname]
      : await input.resolveHost(parsed.hostname).catch(() => []);
    if (addresses.length === 0) {
      return sourceFailure(
        input.sourceId,
        input.url,
        "INVALID_SOURCE",
        `Source hostname ${parsed.hostname} could not be resolved`,
        input.fetchedAt
      );
    }
    if (addresses.some(isPrivateAddress)) {
      return sourceFailure(
        input.sourceId,
        input.url,
        "PRIVATE_NETWORK_BLOCKED",
        `Source hostname ${parsed.hostname} resolves to a private or local network`,
        input.fetchedAt
      );
    }
  }

  let response: HttpFetchResponse;
  try {
    response = await input.fetcher(input.url, {
      timeoutMs: input.policy.timeoutMs,
      maxResponseBytes: input.policy.maxResponseBytes,
      maxRedirects: input.policy.maxRedirects
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /timeout/i.test(message) ? "TIMEOUT" : "HTTP_FAILURE";
    return sourceFailure(input.sourceId, input.url, code, message, input.fetchedAt);
  }

  if ((response.redirects?.length ?? 0) > input.policy.maxRedirects) {
    return sourceFailure(input.sourceId, input.url, "REDIRECT_LIMIT", "HTTP redirect limit exceeded", input.fetchedAt);
  }
  if (response.body.byteLength > input.policy.maxResponseBytes) {
    return sourceFailure(input.sourceId, input.url, "RESPONSE_TOO_LARGE", "HTTP response exceeded configured byte limit", input.fetchedAt);
  }
  if (response.status === 401 || response.status === 403) {
    return sourceFailure(input.sourceId, input.url, "AUTH_FAILURE", `HTTP ${response.status}`, input.fetchedAt);
  }
  if (response.status >= 400) {
    return sourceFailure(input.sourceId, input.url, "HTTP_FAILURE", `HTTP ${response.status}`, input.fetchedAt);
  }

  const contentType = response.headers["content-type"] ?? response.headers["Content-Type"] ?? "";
  if (!contentTypeAllowed(contentType, input.policy.allowedContentTypes)) {
    return sourceFailure(
      input.sourceId,
      input.url,
      "UNSUPPORTED_CONTENT_TYPE",
      `Unsupported content type ${contentType || "unknown"}`,
      input.fetchedAt
    );
  }

  const contentHash = hashBytes(response.body);
  const snapshot: SourceSnapshot = {
    id: `snapshot:${input.sourceId}:${contentHash}`,
    schemaId: SCHEMA_IDS.SOURCE_SNAPSHOT,
    schemaVersion: SCHEMA_VERSIONS.SOURCE_SNAPSHOT,
    sourceId: input.sourceId,
    uri: response.url,
    contentType: contentType.split(";", 1)[0]?.trim().toLowerCase() ?? contentType,
    contentHash,
    fetchedAt: input.fetchedAt,
    httpStatus: response.status,
    bodyStorageRef: stableStorageRef(input.sourceId, contentHash),
    extractionVersion: SOURCE_ADAPTER_VERSION,
    ...(response.headers.etag === undefined ? {} : { etag: response.headers.etag }),
    ...(response.headers["last-modified"] === undefined
      ? {}
      : { lastModified: response.headers["last-modified"] })
  };

  return { status: "CAPTURED", snapshot };
}
