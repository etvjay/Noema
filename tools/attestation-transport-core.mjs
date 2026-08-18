#!/usr/bin/env node
// Attestation & commitment transport measurement harness (#62).
//
// Deterministically measures calldata size and, where the RPC permits,
// reads the live gas price to express per-operation cost. This is the
// executable evidence base for the X Layer attestation transport decision
// record. It does NOT broadcast transactions.

import { createHash } from "node:crypto";

const RPC = process.env.XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech/terigon";
const GAS_PER_CALLDATA_BYTE = 16n; // EIP-2028 calldata non-zero-byte cost
const GAS_PER_CALLDATA_ZERO_BYTE = 4n;
const BASE_TX_GAS = 21000n;

function padTo32(hex) {
  return "0x" + hex.slice(2).padStart(64, "0");
}

function encodeBytes32(value) {
  return padTo32(value);
}

function encodeUint64(value) {
  const hex = BigInt(value).toString(16).padStart(16, "0");
  return "0x" + hex.padStart(64, "0");
}

function encodeAddress(value) {
  return "0x" + value.toLowerCase().slice(2).padStart(64, "0");
}

function encodeUint(value) {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return "0x" + hex;
}

// Minimal ABI encoder for the types used by the three transports.
function encodeDynamicString(value) {
  const bytes = Buffer.from(value, "utf8");
  const paddedLength = Math.ceil(bytes.length / 32) * 32;
  const padded = Buffer.concat([bytes, Buffer.alloc(paddedLength - bytes.length)]);
  const offset = encodeUint(32);
  const length = encodeUint(bytes.length);
  return offset + length + padded.toString("hex");
}

function selector(signature) {
  return createHash("sha256").update(signature).digest("hex").slice(0, 8);
}

function calldataBytes(hex) {
  return (hex.length - 2) / 2;
}

function zeroBytes(hex) {
  let count = 0;
  for (let i = 2; i < hex.length; i += 2) {
    if (hex.slice(i, i + 2) === "00") count += 1;
  }
  return count;
}

function gasFor(hex) {
  const bytes = calldataBytes(hex);
  const zeros = zeroBytes(hex);
  const nonZero = bytes - zeros;
  const calldataGas = BigInt(nonZero) * GAS_PER_CALLDATA_BYTE + BigInt(zeros) * GAS_PER_CALLDATA_ZERO_BYTE;
  return { bytes, zeros, nonZero, calldataGas, estimatedTotalGas: BASE_TX_GAS + calldataGas };
}

// ---- Transport A: Noema-native registry commitment -------------------------
function transportARegister(objectId, objectRoot, evidenceRoot) {
  return "0x" + selector("registerObject(bytes32,bytes32,bytes32)") +
    encodeBytes32(objectId).slice(2) + encodeBytes32(objectRoot).slice(2) + encodeBytes32(evidenceRoot).slice(2);
}

function transportAAttest(objectId, claimId, attestationHash) {
  return "0x" + selector("attestClaim(bytes32,bytes32,bytes32)") +
    encodeBytes32(objectId).slice(2) + encodeBytes32(claimId).slice(2) + encodeBytes32(attestationHash).slice(2);
}

function transportARevoke(objectId, claimId, attestationHash) {
  return "0x" + selector("revokeAttestation(bytes32,bytes32,bytes32)") +
    encodeBytes32(objectId).slice(2) + encodeBytes32(claimId).slice(2) + encodeBytes32(attestationHash).slice(2);
}

// ---- Transport B: signed offchain envelope + onchain root anchoring --------
// Envelope hash is anchored via attestClaim with the envelope digest as
// attestationHash; revokeAttestation carries the revocation signal.
function transportBAnchor(objectId, claimId, envelopeHash) {
  return "0x" + selector("attestClaim(bytes32,bytes32,bytes32)") +
    encodeBytes32(objectId).slice(2) + encodeBytes32(claimId).slice(2) + encodeBytes32(envelopeHash).slice(2);
}

function transportBRevoke(objectId, claimId, envelopeHash) {
  return "0x" + selector("revokeAttestation(bytes32,bytes32,bytes32)") +
    encodeBytes32(objectId).slice(2) + encodeBytes32(claimId).slice(2) + encodeBytes32(envelopeHash).slice(2);
}

// ---- Transport C: EAS onchain attestation ----------------------------------
function transportCSchemaRegister(schemaString) {
  // register(string schema, address resolver, bool revocable)
  const schema = encodeDynamicString(schemaString);
  const resolver = encodeAddress("0x0000000000000000000000000000000000000000");
  const revocable = encodeUint(1);
  return "0x" + selector("register(string,address,bool)") + schema.slice(2) + resolver.slice(2) + revocable.slice(2);
}

function transportCAttest(recipient, schemaUid, expiration, refUid, dataHex) {
  // attest(AttestationRequest{ recipient, expirationTime, revocable, refUID,
  //   data(bytes), value }) — data is the schema payload.
  const recipientWord = encodeAddress(recipient);
  const expirationWord = encodeUint(expiration);
  const revocableWord = encodeUint(1);
  const refWord = encodeBytes32(refUid);
  const dataOffset = encodeUint(160);
  const dataLength = encodeUint(calldataBytes(dataHex));
  const dataPaddedLength = Math.ceil(calldataBytes(dataHex) / 32) * 32;
  const dataPadded = dataHex.slice(2).padEnd(dataPaddedLength * 2, "0");
  const valueWord = encodeUint(0);
  return "0x" + selector("attest(((address,uint64,bool,bytes32,bytes,uint256)))") +
    recipientWord.slice(2) + expirationWord.slice(2) + revocableWord.slice(2) +
    refWord.slice(2) + dataOffset.slice(2) + dataLength.slice(2) +
    dataPadded + valueWord.slice(2);
}


export {
  GAS_PER_CALLDATA_BYTE,
  GAS_PER_CALLDATA_ZERO_BYTE,
  BASE_TX_GAS,
  calldataBytes,
  zeroBytes,
  gasFor,
  encodeBytes32,
  transportARegister,
  transportAAttest,
  transportARevoke,
  transportBAnchor,
  transportBRevoke,
  transportCSchemaRegister,
  transportCAttest
};
