import { z } from "zod";
import {
  SchemaRegistry,
  versionedFromZod
} from "@noema/schemas";
import { MigrationRegistry } from "@noema/schemas/migration";
import type { SchemaId, SchemaVersion } from "@noema/economic-kernel";

export const TEST_LEDGER_SCHEMA_ID = "noema:test:ledger";
export const TEST_NOTE_SCHEMA_ID = "noema:test:note";

export type TestLedgerV1 = {
  id: string;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  holder: string;
  balance: string;
  assetClass: string;
};

export type TestLedgerV2 = {
  id: string;
  schemaId: SchemaId;
  schemaVersion: 2;
  holder: string;
  balance: string;
  assetClass: string;
  balanceUnits: string;
};

export type TestLedgerV3 = {
  id: string;
  schemaId: SchemaId;
  schemaVersion: 3;
  holder: string;
  balance: string;
  assetClass: string;
  balanceUnits: string;
  eligibility: "STANDARD" | "QUALIFIED";
};

const refSchema = z.string().min(1);
const balanceSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

export const ledgerV1Schema = z
  .object({
    id: refSchema,
    schemaId: z.literal(TEST_LEDGER_SCHEMA_ID),
    schemaVersion: z.literal(1),
    holder: refSchema,
    balance: balanceSchema,
    assetClass: z.string().min(1)
  })
  .strict();

export const ledgerV2Schema = z
  .object({
    id: refSchema,
    schemaId: z.literal(TEST_LEDGER_SCHEMA_ID),
    schemaVersion: z.literal(2),
    holder: refSchema,
    balance: balanceSchema,
    assetClass: z.string().min(1),
    balanceUnits: z.string().regex(/^\d+$/)
  })
  .strict();

export const ledgerV3Schema = z
  .object({
    id: refSchema,
    schemaId: z.literal(TEST_LEDGER_SCHEMA_ID),
    schemaVersion: z.literal(3),
    holder: refSchema,
    balance: balanceSchema,
    assetClass: z.string().min(1),
    balanceUnits: z.string().regex(/^\d+$/),
    eligibility: z.enum(["STANDARD", "QUALIFIED"])
  })
  .strict();

export const noteV1Schema = z
  .object({
    id: refSchema,
    schemaId: z.literal(TEST_NOTE_SCHEMA_ID),
    schemaVersion: z.literal(1),
    body: refSchema
  })
  .strict();

export function toMicroUnits(amount: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount);
  if (match === null) {
    throw new Error(`Invalid balance amount: ${amount}`);
  }
  const whole = match[1];
  const fractionRaw = match[2] ?? "";
  if (whole === undefined || fractionRaw.length > 6) {
    throw new Error(`Balance exceeds 6-decimal precision: ${amount}`);
  }
  const fraction = fractionRaw.padEnd(6, "0");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction)).toString();
}

export function migrateLedgerV1ToV2(input: TestLedgerV1): TestLedgerV2 {
  return {
    id: input.id,
    schemaId: TEST_LEDGER_SCHEMA_ID,
    schemaVersion: 2,
    holder: input.holder,
    balance: input.balance,
    assetClass: input.assetClass,
    balanceUnits: toMicroUnits(input.balance)
  };
}

export function migrateLedgerV2ToV3(input: TestLedgerV2): TestLedgerV3 {
  return {
    id: input.id,
    schemaId: TEST_LEDGER_SCHEMA_ID,
    schemaVersion: 3,
    holder: input.holder,
    balance: input.balance,
    assetClass: input.assetClass,
    balanceUnits: input.balanceUnits,
    eligibility: input.assetClass === "TREASURY" ? "STANDARD" : "QUALIFIED"
  };
}

export function makeLedgerV1(overrides: Partial<TestLedgerV1> = {}): TestLedgerV1 {
  return {
    id: "ledger:fixture:acct-1",
    schemaId: TEST_LEDGER_SCHEMA_ID,
    schemaVersion: 1,
    holder: "holder:fixture:acme",
    balance: "100.500000",
    assetClass: "TREASURY",
    ...overrides
  };
}

export function makeLedgerV2(overrides: Partial<TestLedgerV2> = {}): TestLedgerV2 {
  const base = makeLedgerV1();
  return {
    ...base,
    schemaVersion: 2,
    balanceUnits: toMicroUnits(base.balance),
    ...overrides
  };
}

export function makeLedgerV3(overrides: Partial<TestLedgerV3> = {}): TestLedgerV3 {
  const base = makeLedgerV2();
  return {
    ...base,
    schemaVersion: 3,
    eligibility: "STANDARD",
    ...overrides
  };
}

export function makeNoteV1(overrides: Partial<Record<string, unknown>> = {}): {
  id: string;
  schemaId: string;
  schemaVersion: 1;
  body: string;
} {
  return {
    id: "note:fixture:1",
    schemaId: TEST_NOTE_SCHEMA_ID,
    schemaVersion: 1,
    body: "hello",
    ...overrides
  };
}

export const testLedgerSchemaRegistry = new SchemaRegistry()
  .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 1, ledgerV1Schema))
  .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 2, ledgerV2Schema))
  .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 3, ledgerV3Schema));

export const testLedgerMigrationRegistry = new MigrationRegistry(
  testLedgerSchemaRegistry
)
  .register(
    TEST_LEDGER_SCHEMA_ID,
    1,
    2,
    "test:ledger:v1-to-v2",
    migrateLedgerV1ToV2
  )
  .register(
    TEST_LEDGER_SCHEMA_ID,
    2,
    3,
    "test:ledger:v2-to-v3",
    migrateLedgerV2ToV3
  );