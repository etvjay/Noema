import { privateKeyToAccount } from "viem/accounts";

export function eip712TestSignerAddress(privateKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(privateKey).address;
}

export async function signEip712TestVector(input: {
  privateKey: `0x${string}`;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  const account = privateKeyToAccount(input.privateKey);
  const signature = await account.signTypedData({
    domain: input.domain,
    types: input.types,
    primaryType: input.primaryType,
    message: input.message
  } as never);
  return {
    address: account.address,
    signature
  };
}
