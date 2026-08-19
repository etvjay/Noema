import type { CommandOutput } from "./exit.js";
import { EXIT, usageError, internalError } from "./exit.js";
import { renderOutput, type OutputOptions } from "./render.js";
import { schemaValidate } from "./commands/schema.js";
import { sourceInspect, sourceCapture, sourceReplay } from "./commands/source.js";
import { rootsCompute, rootsVerify } from "./commands/roots.js";
import { receiptVerify } from "./commands/receipt.js";
import { representationInspect, representationValidate } from "./commands/representation.js";
import { objectInspect, objectDiff } from "./commands/object.js";
import { attestationSign, attestationVerify, attestationRevokeCheck } from "./commands/attestation.js";
import { synchronyReplay } from "./commands/synchrony.js";
import { profileEvaluate } from "./commands/profile.js";
import { doctor } from "./commands/doctor.js";

const HELP = `noema — Noema conformance and tooling CLI

Usage:
  noema [--format text|json] <command> [args...]

Commands:
  schema validate <artifact>
  source inspect <snapshot>
  source capture <raw-document>
  source replay <snapshot> <evidence-input>
  representation inspect <identity>
  representation validate <identity-pair>
  roots compute <object>
  roots verify <object>
  object inspect <object>
  object diff <object> <object>
  attestation sign <artifact> [--key <hex>]
  attestation verify <artifact>
  attestation revoke-check <artifact>
  synchrony replay <scenario> [--shuffle]
  profile evaluate <profile> <object> [reference-profile]
  receipt verify <receipt> [object]
  doctor
  help

Exit codes:
  0 VALID  1 INVALID  2 UNRESOLVED  3 SOURCE_FAILURE  4 VERIFICATION_FAILURE
  5 UNSUPPORTED_VERSION  64 USAGE  70 INTERNAL
`;

function parseFormat(args: string[]): { rest: string[]; format: OutputOptions["format"] } {
  let format: OutputOptions["format"] = "text";
  const rest: string[] = [];
  for (const arg of args) {
    if (arg === "--format=json") {
      format = "json";
    } else if (arg === "--format") {
      format = "json";
    } else if (arg === "--format=text") {
      format = "text";
    } else {
      rest.push(arg);
    }
  }
  return { rest, format };
}

function parseKey(args: string[]): { rest: string[]; key?: string } {
  const rest: string[] = [];
  let key: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--key" && args[index + 1]) {
      key = args[index + 1];
      index += 1;
    } else if (args[index]?.startsWith("--key=")) {
      key = args[index]?.slice("--key=".length);
    } else {
      rest.push(args[index] as string);
    }
  }
  const result: { rest: string[]; key?: string } = { rest };
  if (key !== undefined) result.key = key;
  return result;
}

async function dispatch(rest: string[], format: OutputOptions["format"]): Promise<CommandOutput> {
  const [command, subcommand, ...args] = rest;
  const has = (name: string): boolean => command === name && subcommand !== undefined;
  void has;

  if (rest.length === 0) {
    return outputHelp();
  }
  if (command === "help" || command === "--help" || command === "-h") {
    return outputHelp();
  }
  if (command === "doctor") {
    return doctor();
  }
  if (command === "schema" && subcommand === "validate") {
    return schemaValidate(args[0] as string);
  }
  if (command === "source" && subcommand === "inspect") {
    return sourceInspect(args[0] as string);
  }
  if (command === "source" && subcommand === "capture") {
    return sourceCapture(args[0] as string);
  }
  if (command === "source" && subcommand === "replay") {
    return sourceReplay(args[0] as string, args[1] as string);
  }
  if (command === "representation" && subcommand === "inspect") {
    return representationInspect(args[0] as string);
  }
  if (command === "representation" && subcommand === "validate") {
    return representationValidate(args[0] as string);
  }
  if (command === "roots" && subcommand === "compute") {
    return rootsCompute(args[0] as string);
  }
  if (command === "roots" && subcommand === "verify") {
    return rootsVerify(args[0] as string);
  }
  if (command === "object" && subcommand === "inspect") {
    return objectInspect(args[0] as string);
  }
  if (command === "object" && subcommand === "diff") {
    return objectDiff(args[0] as string, args[1] as string);
  }
  if (command === "attestation" && subcommand === "sign") {
    const parsed = parseKey(args);
    return attestationSign(parsed.rest[0] as string, parsed.key);
  }
  if (command === "attestation" && subcommand === "verify") {
    return attestationVerify(args[0] as string);
  }
  if (command === "attestation" && subcommand === "revoke-check") {
    return attestationRevokeCheck(args[0] as string);
  }
  if (command === "synchrony" && subcommand === "replay") {
    const shuffle = args.includes("--shuffle");
    const path = args.find((arg) => arg !== "--shuffle");
    return synchronyReplay(path as string, { shuffle });
  }
  if (command === "profile" && subcommand === "evaluate") {
    return profileEvaluate(args[0] as string, args[1] as string, args[2] as string);
  }
  if (command === "receipt" && subcommand === "verify") {
    return receiptVerify(args[0] as string, args[1] as string);
  }
  return usageError(`unknown command: ${command} ${subcommand ?? ""}`);
}

function outputHelp(): CommandOutput {
  return { code: EXIT.USAGE, summary: HELP.trim(), details: {} };
}

export async function main(argv: string[]): Promise<number> {
  const { rest, format } = parseFormat(argv);
  try {
    const result = await dispatch(rest, format);
    process.stdout.write(renderOutput(result, { format }));
    return result.code;
  } catch (error) {
    const result = internalError(error);
    process.stdout.write(renderOutput(result, { format }));
    return result.code;
  }
}