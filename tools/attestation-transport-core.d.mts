export const GAS_PER_CALLDATA_BYTE: bigint;
export const GAS_PER_CALLDATA_ZERO_BYTE: bigint;
export const BASE_TX_GAS: bigint;

export function calldataBytes(hex: string): number;
export function zeroBytes(hex: string): number;
export function gasFor(hex: string): {
  bytes: number;
  zeros: number;
  nonZero: number;
  calldataGas: bigint;
  estimatedTotalGas: bigint;
};
export function encodeBytes32(value: string): string;

export function transportARegister(objectId: string, objectRoot: string, evidenceRoot: string): string;
export function transportAAttest(objectId: string, claimId: string, attestationHash: string): string;
export function transportARevoke(objectId: string, claimId: string, attestationHash: string): string;
export function transportBAnchor(objectId: string, claimId: string, envelopeHash: string): string;
export function transportBRevoke(objectId: string, claimId: string, envelopeHash: string): string;
export function transportCSchemaRegister(schemaString: string): string;
export function transportCAttest(
  recipient: string,
  schemaUid: string,
  expiration: number,
  refUid: string,
  dataHex: string
): string;
