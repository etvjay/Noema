import { computeRoots, hashUtf8 } from "@noema/canonicalization";
import { makeEconomicObject } from "../tests/helpers.ts";

const object = makeEconomicObject();
const roots = computeRoots(object);

process.stdout.write(`${JSON.stringify({
  fixtureKind: "LIVE_COMMITMENT_OF_DEMO_FIXTURE",
  objectIdText: object.id,
  objectId: hashUtf8(object.id),
  version: object.version,
  objectRoot: roots.objectRoot,
  evidenceRoot: roots.evidenceRoot,
  hashingVersion: "noema-hashing-v1"
})}\n`);
