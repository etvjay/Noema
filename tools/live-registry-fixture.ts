import { computeRoots, HASHING_VERSION_V1, hashUtf8 } from "@noema/canonicalization";
import { makeEconomicObject } from "../tests/helpers.ts";

const object = makeEconomicObject();
const roots = computeRoots(object, HASHING_VERSION_V1);

process.stdout.write(`${JSON.stringify({
  fixtureKind: "LIVE_COMMITMENT_OF_DEMO_FIXTURE",
  objectIdText: object.id,
  objectId: hashUtf8(object.id),
  version: object.version,
  objectRoot: roots.objectRoot,
  evidenceRoot: roots.evidenceRoot,
  hashingVersion: roots.hashingVersion
})}\n`);