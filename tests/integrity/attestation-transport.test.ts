import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  transportARegister,
  transportAAttest,
  transportARevoke,
  transportBAnchor,
  transportBRevoke,
  transportCSchemaRegister,
  transportCAttest,
  gasFor
} from "../../tools/attestation-transport-core.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const objectId = "0x" + "1".repeat(64);
const objectRoot = "0x" + "2".repeat(64);
const evidenceRoot = "0x" + "3".repeat(64);
const claimId = "0x" + "4".repeat(64);
const envelopeHash = "0x" + "5".repeat(64);
const schema = "noema:venue-economic-attestation(address subject,string proposition,bytes32 evidenceRoot)";
const schemaUid = "0x" + "6".repeat(64);
const recipient = "0x0000000000000000000000000000000000000000";
const easData = "0x" + "5".repeat(64) + "4".repeat(64);

describe("attestation transport decision (#62)", () => {
  it("registry and envelope-anchored operations carry fixed 100-byte calldata", () => {
    for (const hex of [
      transportARegister(objectId, objectRoot, evidenceRoot),
      transportAAttest(objectId, claimId, envelopeHash),
      transportARevoke(objectId, claimId, envelopeHash),
      transportBAnchor(objectId, claimId, envelopeHash),
      transportBRevoke(objectId, claimId, envelopeHash)
    ]) {
      expect(gasFor(hex).bytes).toBe(100);
    }
  });

  it("EAS schema registration and attestation are strictly larger than the native+envelope path", () => {
    const schemaGas = gasFor(transportCSchemaRegister(schema));
    const attestGas = gasFor(transportCAttest(recipient, schemaUid, 0, "0x" + "0".repeat(64), easData));
    expect(schemaGas.bytes).toBeGreaterThan(100);
    expect(attestGas.bytes).toBeGreaterThan(100);
    expect(schemaGas.bytes).toBe(229);
    expect(attestGas.bytes).toBe(292);
  });

  it("EAS offers no calldata-cost advantage for the envelope anchoring use case", () => {
    const anchor = gasFor(transportBAnchor(objectId, claimId, envelopeHash));
    const attest = gasFor(transportCAttest(recipient, schemaUid, 0, "0x" + "0".repeat(64), easData));
    expect(attest.bytes).toBeGreaterThan(anchor.bytes);
    expect(attest.calldataGas).toBeGreaterThan(anchor.calldataGas);
  });

  it("transport semantics are independent of onchain transport choice (roots, not claims)", () => {
    const registryAnchor = transportAAttest(objectId, claimId, envelopeHash);
    const envelopeAnchor = transportBAnchor(objectId, claimId, envelopeHash);
    expect(registryAnchor.length).toBe(envelopeAnchor.length);
    // Both transports carry exactly the 32-byte canonical envelope hash as the
    // onchain witness; neither places venue-proprietary metadata onchain.
    expect(registryAnchor).toContain(envelopeHash.slice(2));
    expect(envelopeAnchor).toContain(envelopeHash.slice(2));
  });

  it("decision record, protocol, and raw observations are committed for replay", () => {
    for (const rel of [
      "docs/adr/0010-xlayer-attestation-transport.md",
      "experiments/state/noema-xlayer-attestation-transport/protocol.md",
      "experiments/state/noema-xlayer-attestation-transport/result.json",
      "experiments/state/noema-xlayer-attestation-transport/privacy-analysis.md",
      "experiments/state/noema-xlayer-attestation-transport/raw-measurement.json",
      "experiments/state/noema-xlayer-attestation-transport/raw-eas-predeploy-probe.json",
      "experiments/state/noema-xlayer-attestation-transport/raw-xlayer-probe.json"
    ]) {
      expect(existsSync(resolve(REPO_ROOT, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it("result.json records EAS as rejected and A+B as selected", () => {
    const result = JSON.parse(readFileSync(resolve(REPO_ROOT, "experiments/state/noema-xlayer-attestation-transport/result.json"), "utf8"));
    expect(result.result).toBe("PASS");
    expect(result.decision.selected).toContain("A:registry-commitment");
    expect(result.decision.selected).toContain("B:envelope-anchored");
    expect(result.decision.rejected.some((r: { transport: string }) => r.transport === "C:eas")).toBe(true);
    expect(result.promotionThresholds.easOfficialSupportObserved).toBe(false);
  });

  it("ADER record forbids EAS adoption absent official support and live write roundtrip", () => {
    const adr = readFileSync(resolve(REPO_ROOT, "docs/adr/0010-xlayer-attestation-transport.md"), "utf8");
    expect(adr).toContain("Status: Accepted");
    expect(adr).toMatch(/C \(EAS\) is rejected/);
    expect(adr).toMatch(/no transaction was broadcast/);
    expect(adr).toMatch(/live write roundtrip is still required|live write roundtrip/);
  });
});