import type {
  Evidence,
  JsonValue,
  Ref,
  SourceSnapshot
} from "@noema/economic-kernel";
import type { ProposedClaim } from "./types.js";

export interface ExtractClaimsInput {
  subject: Ref;
  sourceSnapshots: readonly SourceSnapshot[];
  evidence: readonly Evidence[];
  sourceBodies?: Record<Ref, string | JsonValue>;
  targetProperties?: string[];
  minConfidence?: number;
}

export function extractClaims(input: ExtractClaimsInput): ProposedClaim[] {
  const proposedClaims: ProposedClaim[] = [];
  const minConfidence = input.minConfidence ?? 0.5;

  const sourceMap = new Map(input.sourceSnapshots.map((s) => [s.id, s]));

  for (const ev of input.evidence) {
    const source = sourceMap.get(ev.source);
    if (!source) continue;

    const rawBody = input.sourceBodies?.[source.id] ?? (ev.metadata["rawBody"] as string | JsonValue | undefined);
    if (!rawBody) continue;

    const rawData =
      typeof rawBody === "string"
        ? tryParseJson(rawBody)
        : rawBody;

    if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
      extractFromStructuredObject(input.subject, rawData as Record<string, unknown>, source, ev, proposedClaims);
    } else if (typeof rawBody === "string") {
      extractFromText(input.subject, rawBody, source, ev, proposedClaims);
    }
  }

  if (input.targetProperties && input.targetProperties.length > 0) {
    const targetSet = new Set(input.targetProperties);
    return proposedClaims.filter((c) => targetSet.has(c.property) && c.confidence >= minConfidence);
  }

  return proposedClaims.filter((c) => c.confidence >= minConfidence);
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractFromStructuredObject(
  subject: Ref,
  obj: Record<string, unknown>,
  source: SourceSnapshot,
  evidence: Evidence,
  out: ProposedClaim[]
): void {
  // 1. Identity / Fund Name
  const nameKeys = ["fundName", "assetName", "name", "fund", "product"];
  for (const key of nameKeys) {
    if (typeof obj[key] === "string" && (obj[key] as string).trim().length > 0) {
      out.push({
        id: `claim:prop:${subject}:economicIdentity:${source.id}`,
        subject,
        property: "economicIdentity",
        value: obj[key] as string,
        confidence: 1.0,
        isDirect: true,
        sourceRefs: [source.id],
        evidenceRefs: [evidence.id],
        locator: `json:$.${key}`,
        explanation: `Direct property '${key}' from source document`
      });
      break;
    }
  }

  // 2. Identifiers (CUSIP, ISIN, Ticker)
  if (typeof obj["cusip"] === "string") {
    out.push({
      id: `claim:prop:${subject}:cusip:${source.id}`,
      subject,
      property: "cusip",
      value: obj["cusip"],
      confidence: 1.0,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: "json:$.cusip",
      explanation: "Direct CUSIP identifier"
    });
  }

  if (typeof obj["isin"] === "string") {
    out.push({
      id: `claim:prop:${subject}:isin:${source.id}`,
      subject,
      property: "isin",
      value: obj["isin"],
      confidence: 1.0,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: "json:$.isin",
      explanation: "Direct ISIN identifier"
    });
  }

  if (typeof obj["ticker"] === "string" || typeof obj["symbol"] === "string") {
    const sym = (obj["ticker"] ?? obj["symbol"]) as string;
    out.push({
      id: `claim:prop:${subject}:ticker:${source.id}`,
      subject,
      property: "ticker",
      value: sym,
      confidence: 1.0,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: "json:$.ticker",
      explanation: "Direct market ticker symbol"
    });
  }

  // 3. NAV / Valuation
  const navKeys = ["nav", "sharePrice", "netAssetValue", "price"];
  for (const key of navKeys) {
    if (typeof obj[key] === "number" || (typeof obj[key] === "string" && !isNaN(Number(obj[key])))) {
      const numVal = typeof obj[key] === "number" ? (obj[key] as number) : Number(obj[key]);
      out.push({
        id: `claim:prop:${subject}:nav:${source.id}`,
        subject,
        property: "nav",
        value: numVal,
        unit: (obj["currency"] as string) ?? "USD",
        confidence: 0.98,
        isDirect: true,
        sourceRefs: [source.id],
        evidenceRefs: [evidence.id],
        locator: `json:$.${key}`,
        explanation: `Net asset value from property '${key}'`
      });
      break;
    }
  }

  // 4. Yield / APY / Coupon
  const yieldKeys = ["yieldBps", "apyBps", "couponBps", "yield", "apy"];
  for (const key of yieldKeys) {
    if (obj[key] !== undefined) {
      let bpsVal: number;
      let isDirect = true;
      if (key.endsWith("Bps")) {
        bpsVal = Number(obj[key]);
      } else {
        // Percentage (e.g. 5.12 -> 512 bps)
        bpsVal = Math.round(Number(obj[key]) * 100);
        isDirect = false;
      }
      if (!isNaN(bpsVal)) {
        out.push({
          id: `claim:prop:${subject}:yieldBps:${source.id}`,
          subject,
          property: "yieldBps",
          value: bpsVal,
          unit: "bps",
          confidence: 0.95,
          isDirect,
          sourceRefs: [source.id],
          evidenceRefs: [evidence.id],
          locator: `json:$.${key}`,
          explanation: isDirect
            ? `Direct basis points value from '${key}'`
            : `Converted percentage '${obj[key]}' to ${bpsVal} basis points`
        });
        break;
      }
    }
  }

  // 5. Share Class
  if (typeof obj["shareClass"] === "string") {
    out.push({
      id: `claim:prop:${subject}:shareClass:${source.id}`,
      subject,
      property: "shareClass",
      value: obj["shareClass"],
      confidence: 0.95,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: "json:$.shareClass",
      explanation: "Direct share class declaration"
    });
  }

  // 6. Issuer / Fund Manager
  const issuerKeys = ["issuer", "fundManager", "sponsor", "entity"];
  for (const key of issuerKeys) {
    if (typeof obj[key] === "string") {
      out.push({
        id: `claim:prop:${subject}:issuer:${source.id}`,
        subject,
        property: "issuer",
        value: obj[key] as string,
        confidence: 0.95,
        isDirect: true,
        sourceRefs: [source.id],
        evidenceRefs: [evidence.id],
        locator: `json:$.${key}`,
        explanation: `Legal issuer / manager from '${key}'`
      });
      break;
    }
  }

  // 7. Backing / Reserves Adequacy
  if (typeof obj["reservesAdequacy"] === "string" || typeof obj["collateralRatio"] === "number") {
    const val = (obj["reservesAdequacy"] ?? obj["collateralRatio"]) as JsonValue;
    out.push({
      id: `claim:prop:${subject}:reservesAdequacy:${source.id}`,
      subject,
      property: "reservesAdequacy",
      value: val,
      confidence: 0.95,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: obj["reservesAdequacy"] !== undefined ? "json:$.reservesAdequacy" : "json:$.collateralRatio",
      explanation: "Direct reserves / collateral declaration"
    });
  }
}

function extractFromText(
  subject: Ref,
  text: string,
  source: SourceSnapshot,
  evidence: Evidence,
  out: ProposedClaim[]
): void {
  // Regex extraction for common legal/filing patterns

  // CUSIP pattern: 9 characters alphanumeric
  const cusipMatch = text.match(/\bCUSIP\s*(?:#|No\.?|:)?\s*([0-9A-Z]{9})\b/i);
  if (cusipMatch?.[1]) {
    out.push({
      id: `claim:prop:${subject}:cusip:${source.id}`,
      subject,
      property: "cusip",
      value: cusipMatch[1],
      confidence: 0.95,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: `text:regex:CUSIP`,
      explanation: "Extracted CUSIP from document body"
    });
  }

  // ISIN pattern: 2 letters + 10 alphanumeric
  const isinMatch = text.match(/\bISIN\s*(?:#|No\.?|:)?\s*([A-Z]{2}[0-9A-Z]{10})\b/i);
  if (isinMatch?.[1]) {
    out.push({
      id: `claim:prop:${subject}:isin:${source.id}`,
      subject,
      property: "isin",
      value: isinMatch[1],
      confidence: 0.95,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: `text:regex:ISIN`,
      explanation: "Extracted ISIN from document body"
    });
  }

  // NAV / Net Asset Value pattern: e.g. "Net Asset Value: $105.42" or "NAV of 105.42 USD"
  const navMatch = text.match(/(?:Net Asset Value|NAV)\s*(?:of|is|:)?\s*\$?([0-9]+\.[0-9]+)\s*(USD|EUR)?/i);
  if (navMatch?.[1]) {
    out.push({
      id: `claim:prop:${subject}:nav:${source.id}`,
      subject,
      property: "nav",
      value: Number(navMatch[1]),
      unit: navMatch[2] ?? "USD",
      confidence: 0.90,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: `text:regex:NAV`,
      explanation: "Extracted NAV valuation from prose text"
    });
  }

  // Share class pattern: e.g. "Share Class: Institutional" or "Series A (Retail)"
  const shareClassMatch = text.match(/(?:Share Class|Class|Series)\s*(?:is|:)?\s*(Institutional|Retail|Class A|Class B|Founder)/i);
  if (shareClassMatch?.[1]) {
    out.push({
      id: `claim:prop:${subject}:shareClass:${source.id}`,
      subject,
      property: "shareClass",
      value: shareClassMatch[1].toLowerCase(),
      confidence: 0.88,
      isDirect: true,
      sourceRefs: [source.id],
      evidenceRefs: [evidence.id],
      locator: `text:regex:ShareClass`,
      explanation: "Extracted share class definition from prose text"
    });
  }
}
