import type {
  Evidence,
  JsonValue,
  Ref,
  SourceSnapshot
} from "@noema/economic-kernel";
import type {
  ProposedClaim,
  ProposedRestriction,
  ProposedRight,
  ProposedUnresolvedIssue
} from "./types.js";

export interface InterpretRightsInput {
  subject: Ref;
  sourceSnapshots: readonly SourceSnapshot[];
  evidence: readonly Evidence[];
  proposedClaims?: readonly ProposedClaim[];
  sourceBodies?: Record<Ref, string | JsonValue>;
}

export interface InterpretRightsResult {
  proposedRights: ProposedRight[];
  proposedRestrictions: ProposedRestriction[];
  proposedUnresolvedIssues: ProposedUnresolvedIssue[];
}

export function interpretRightsAndRestrictions(
  input: InterpretRightsInput
): InterpretRightsResult {
  const proposedRights: ProposedRight[] = [];
  const proposedRestrictions: ProposedRestriction[] = [];
  const proposedUnresolvedIssues: ProposedUnresolvedIssue[] = [];

  const sourceMap = new Map(input.sourceSnapshots.map((s) => [s.id, s]));

  for (const ev of input.evidence) {
    const source = sourceMap.get(ev.source);
    if (!source) continue;

    const rawBody =
      input.sourceBodies?.[source.id] ??
      (ev.metadata["rawBody"] as string | JsonValue | undefined);

    if (!rawBody) continue;

    const rawData =
      typeof rawBody === "string" ? tryParseJson(rawBody) : rawBody;

    if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
      interpretStructuredRights(
        input.subject,
        rawData as Record<string, unknown>,
        source,
        ev,
        proposedRights,
        proposedRestrictions,
        proposedUnresolvedIssues
      );
    } else if (typeof rawBody === "string") {
      interpretTextRights(
        input.subject,
        rawBody,
        source,
        ev,
        proposedRights,
        proposedRestrictions,
        proposedUnresolvedIssues
      );
    }
  }

  // If no redemption right was identified at all across sources, record an unresolved issue
  const hasRedemption = proposedRights.some((r) => r.rightType === "REDEMPTION");
  if (!hasRedemption && input.evidence.length > 0) {
    proposedUnresolvedIssues.push({
      id: `issue:unresolved:${input.subject}:redemption`,
      subject: input.subject,
      issueType: "EVIDENCE_MISSING",
      description: "No redemption terms or withdrawal rights could be established from available evidence",
      missingEvidenceType: "LEGAL_TERMS",
      ambiguityDimension: "redemptionTerms"
    });
  }

  return {
    proposedRights,
    proposedRestrictions,
    proposedUnresolvedIssues
  };
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function interpretStructuredRights(
  subject: Ref,
  obj: Record<string, unknown>,
  source: SourceSnapshot,
  evidence: Evidence,
  rightsOut: ProposedRight[],
  restrictionsOut: ProposedRestriction[],
  _unresolvedOut: ProposedUnresolvedIssue[]
): void {
  // 1. Redemption
  if (obj["redemption"] || obj["liquidity"] || obj["redemptionWindow"]) {
    const red = (obj["redemption"] ?? obj["liquidity"] ?? {}) as Record<string, unknown>;
    const windowStr =
      (typeof obj["redemptionWindow"] === "string" ? obj["redemptionWindow"] : undefined) ??
      (typeof red["window"] === "string" ? red["window"] : undefined) ??
      (typeof red["frequency"] === "string" ? red["frequency"] : "daily");

    const termsStr =
      (typeof red["terms"] === "string" ? red["terms"] : undefined) ??
      (typeof red["noticePeriod"] === "string" ? `Notice period: ${red["noticePeriod"]}` : undefined) ??
      `Redemption window: ${windowStr}`;

    const isTransferable = obj["transferable"] === false || red["transferable"] === false ? "RESTRICTED" : "TRANSFERABLE";

    rightsOut.push({
      id: `right:prop:${subject}:redemption:${source.id}`,
      subject,
      holderType: obj["beneficialOwnership"] === true ? "BENEFICIAL_OWNER" : "TOKEN_HOLDER",
      rightType: "REDEMPTION",
      terms: termsStr,
      transferability: isTransferable,
      redemptionWindow: windowStr,
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "json:$.redemption",
      confidence: 0.95,
      explanation: "Redemption terms extracted from structured filing/metadata"
    });
  }

  // 2. Income / Distribution
  if (obj["distribution"] || obj["yield"] || obj["coupon"] || obj["yieldBps"]) {
    const dist = (obj["distribution"] ?? {}) as Record<string, unknown>;
    const terms = (typeof dist["terms"] === "string" ? dist["terms"] : undefined) ??
      `Yield accrual and distribution terms per fund prospectus`;

    rightsOut.push({
      id: `right:prop:${subject}:income:${source.id}`,
      subject,
      holderType: "TOKEN_HOLDER",
      rightType: "INCOME",
      terms,
      transferability: obj["transferable"] === false ? "RESTRICTED" : "TRANSFERABLE",
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "json:$.distribution",
      confidence: 0.92,
      explanation: "Income/distribution right from yield terms"
    });
  }

  // 3. Eligibility Restrictions
  if (obj["eligibility"] || obj["investorType"] || obj["kycRequired"]) {
    const elig = (obj["eligibility"] ?? {}) as Record<string, unknown>;
    const criteria = (typeof elig["criteria"] === "string" ? elig["criteria"] : undefined) ??
      (typeof obj["investorType"] === "string" ? obj["investorType"] : undefined) ??
      (obj["kycRequired"] === true ? "KYC/AML approval and whitelist required" : "Restricted investor category");

    restrictionsOut.push({
      id: `rest:prop:${subject}:eligibility:${source.id}`,
      subject,
      restrictionType: "ELIGIBILITY",
      eligibilityCriteria: criteria,
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "json:$.eligibility",
      confidence: 0.95,
      explanation: "Investor eligibility restriction"
    });
  }

  // 4. Jurisdictional Restrictions
  if (obj["jurisdiction"] || obj["jurisdictionRestrictions"] || obj["excludedJurisdictions"]) {
    const juris = (typeof obj["jurisdiction"] === "string" ? obj["jurisdiction"] : undefined) ??
      (Array.isArray(obj["excludedJurisdictions"]) ? `Excluded: ${obj["excludedJurisdictions"].join(", ")}` : "Jurisdictional scope limited");

    restrictionsOut.push({
      id: `rest:prop:${subject}:jurisdiction:${source.id}`,
      subject,
      restrictionType: "JURISDICTION",
      jurisdiction: juris,
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "json:$.jurisdiction",
      confidence: 0.95,
      explanation: "Jurisdiction restriction declared in filing"
    });
  }
}

function interpretTextRights(
  subject: Ref,
  text: string,
  source: SourceSnapshot,
  evidence: Evidence,
  rightsOut: ProposedRight[],
  restrictionsOut: ProposedRestriction[],
  _unresolvedOut: ProposedUnresolvedIssue[]
): void {
  // 1. Redemption in prose
  const redMatch = text.match(/redemption(?:\s+window|\s+frequency|\s+terms)?\s*(?:is|:)?\s*([A-Za-z0-9\+\s\-]+?(?:\.|\n|;|$))/i);
  if (redMatch?.[1]) {
    rightsOut.push({
      id: `right:prop:${subject}:redemption:${source.id}`,
      subject,
      holderType: text.toLowerCase().includes("beneficial owner") ? "BENEFICIAL_OWNER" : "TOKEN_HOLDER",
      rightType: "REDEMPTION",
      terms: redMatch[1].trim(),
      transferability: text.toLowerCase().includes("non-transferable") ? "NON_TRANSFERABLE" : "RESTRICTED",
      redemptionWindow: redMatch[1].trim(),
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "text:regex:redemption",
      confidence: 0.88,
      explanation: "Prose redemption clause"
    });
  }

  // 2. Eligibility / Transfer restriction in prose
  if (text.toLowerCase().includes("qualified purchaser") || text.toLowerCase().includes("accredited investor")) {
    const isQP = text.toLowerCase().includes("qualified purchaser");
    restrictionsOut.push({
      id: `rest:prop:${subject}:eligibility:${source.id}`,
      subject,
      restrictionType: "ELIGIBILITY",
      eligibilityCriteria: isQP ? "Qualified Purchaser (QP) under Section 3(c)(7)" : "Accredited Investor under Regulation D",
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "text:regex:eligibility",
      confidence: 0.95,
      explanation: "Explicit investor eligibility requirement"
    });
  }

  if (text.toLowerCase().includes("regulation s") || text.toLowerCase().includes("non-us persons only")) {
    restrictionsOut.push({
      id: `rest:prop:${subject}:jurisdiction:${source.id}`,
      subject,
      restrictionType: "JURISDICTION",
      jurisdiction: "Non-US (Regulation S)",
      claimRefs: [],
      evidenceRefs: [evidence.id],
      locator: "text:regex:reg_s",
      confidence: 0.95,
      explanation: "Offshore Regulation S jurisdictional boundary"
    });
  }
}
