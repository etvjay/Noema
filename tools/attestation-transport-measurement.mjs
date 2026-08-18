// CLI wrapper. Pure measurement functions live in attestation-transport-core.mjs.
import {
  encodeBytes32,
  gasFor,
  transportARegister,
  transportAAttest,
  transportARevoke,
  transportBAnchor,
  transportBRevoke,
  transportCSchemaRegister,
  transportCAttest
} from "./attestation-transport-core.mjs";

const RPC = process.env.XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech/terigon";

async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.json();
  if (!response.ok || body.error !== undefined) {
    throw new Error(`${method} failed: ${JSON.stringify(body.error ?? body)}`);
  }
  return body.result;
}

async function main() {
  const objectId = "0x" + "1".repeat(64);
  const objectRoot = "0x" + "2".repeat(64);
  const evidenceRoot = "0x" + "3".repeat(64);
  const claimId = "0x" + "4".repeat(64);
  const envelopeHash = "0x" + "5".repeat(64);
  const schema = "noema:venue-economic-attestation(address subject,string proposition,bytes32 evidenceRoot)";
  const schemaUid = "0x" + "6".repeat(64);
  const recipient = "0x0000000000000000000000000000000000000000";
  const easData = encodeBytes32(envelopeHash) + encodeBytes32(claimId).slice(2);

  const operations = [
    { transport: "A:registry", operation: "registerObject", hex: transportARegister(objectId, objectRoot, evidenceRoot) },
    { transport: "A:registry", operation: "attestClaim", hex: transportAAttest(objectId, claimId, envelopeHash) },
    { transport: "A:registry", operation: "revokeAttestation", hex: transportARevoke(objectId, claimId, envelopeHash) },
    { transport: "B:envelope-anchored", operation: "anchorEnvelope", hex: transportBAnchor(objectId, claimId, envelopeHash) },
    { transport: "B:envelope-anchored", operation: "revokeEnvelope", hex: transportBRevoke(objectId, claimId, envelopeHash) },
    { transport: "C:eas", operation: "registerSchema", hex: transportCSchemaRegister(schema) },
    { transport: "C:eas", operation: "attestEnvelope", hex: transportCAttest(recipient, schemaUid, 0, "0x" + "0".repeat(64), easData) }
  ];

  const measured = operations.map(({ transport, operation, hex }) => {
    const gas = gasFor(hex);
    return {
      transport,
      operation,
      calldataBytes: gas.bytes,
      calldataGas: gas.calldataGas.toString(),
      estimatedTotalGas: gas.estimatedTotalGas.toString()
    };
  });

  let gasPrice = null;
  let gasPriceError = null;
  try {
    const raw = await rpc("eth_gasPrice");
    gasPrice = BigInt(raw);
  } catch (error) {
    gasPriceError = String(error);
  }

  const withCost = measured.map((entry) => {
    const estCostWei = gasPrice !== null ? BigInt(entry.estimatedTotalGas) * gasPrice : null;
    return { ...entry, estCostWei: estCostWei !== null ? estCostWei.toString() : null };
  });

  const receipt = {
    kind: "attestation-transport-measurement",
    version: "noema-attestation-transport-measurement-v1",
    observedAt: new Date().toISOString(),
    rpc: RPC,
    gasPriceWei: gasPrice !== null ? gasPrice.toString() : null,
    gasPriceError,
    operations: withCost,
    note: "calldataGas uses EIP-2028 costs (16/4 gas per non-zero/zero byte) plus 21000 base. estCostWei is estimatedTotalGas x live gas price; no transaction was broadcast."
  };

  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(JSON.stringify({ kind: "attestation-transport-measurement", error: String(error) }));
  process.exit(2);
});