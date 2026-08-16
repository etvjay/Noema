# Noema canonical hashing specification

Status: E1 implementation contract. The algorithms below are deterministic
and tested locally; production and X Layer claims remain E0 until deployed and
independently replayed.

## Domain and algorithm

- Canonical serialization: RFC 8785 JSON Canonicalization Scheme (JCS).
- Text encoding: UTF-8.
- Digest: Keccak-256, represented as lowercase 0x-prefixed hexadecimal.
- Current object domain: `noema:economic-object:v2`.
- Current evidence leaf domain: `noema:evidence-leaf:v2`.
- Merkle domain: `noema:evidence-merkle:v1` (unchanged; the merkle container
  only commits to child digests and never changes shape). Merkle node payloads
  are version-directed through an explicit `hashingVersion` field, so a v1
  tree and a v2 tree over the same evidence are never conflated.

The implementation must reject values that cannot be represented as valid JSON
and must never use arbitrary JSON.stringify output as canonical JSON.

## Hashing versions

Canonical root computation is version-directed. Every projection and root
function accepts an optional `hashingVersion` argument and defaults to the
current version.

- `noema-hashing-v1` (legacy, replay-only): binds the v1 domains
  (`noema:economic-object:v1`, `noema:evidence-leaf:v1`) and never projects
  in-band schema identity fields. It exists solely to replay roots that were
  committed before schema versioning was introduced.
- `noema-hashing-v2` (current): binds the v2 domains
  (`noema:economic-object:v2`, `noema:evidence-leaf:v2`) and projects the
  in-band `schemaId`/`schemaVersion` identity of every versioned artifact.

New commitments must use the current hashing version. A v1-replayed root is
never promoted into a v2 commitment; they are distinct commitment classes.

A v2 commitment must bind the in-band schema identity of every versioned
artifact it projects. If an artifact lacks `schemaId`/`schemaVersion`, v2 root
computation fails closed rather than silently omitting the identity fields
(which would conflate a v2 commitment with v1 semantics under a v2 domain).

## Economic object projection

The object root hashes this projection:

~~~text
domain
hashingVersion
schemaId            (v2 only)
schemaVersion       (v2 only)
id
version
classification
identifiers
representations
relationships
parties
rights
obligations
restrictions
economics
claims
evidence
attestations
exceptions
provenance
status
verification.status
verification.verifierVersion
verification.checks
~~~

createdAt, updatedAt, verification.objectRoot, and
verification.evidenceRoot are excluded. They are operational or derived
fields and would otherwise make a root circular or change it without a
semantic change.

When replaying `noema-hashing-v1`, the object-level and every nested
`schemaId`/`schemaVersion` field are stripped from the projection so legacy
roots replay byte-for-byte.

Arrays are sorted by their stable id where the object model provides one. The
reducer is responsible for producing already-normalized arrays before hashing.
The canonicalization package does not silently reorder semantic arrays.

## Evidence leaves

Each evidence leaf hashes the canonical object. Under the current hashing
version:

~~~json
{
  "domain": "noema:evidence-leaf:v2",
  "hashingVersion": "noema-hashing-v2",
  "schemaId": "...",
  "schemaVersion": 1,
  "id": "...",
  "type": "...",
  "source": "...",
  "contentHash": "...",
  "locator": "...",
  "observedAt": 0,
  "fetchedAt": 0,
  "authority": "...",
  "freshness": "...",
  "metadata": {}
}
~~~

Under `noema-hashing-v1` the `schemaId`/`schemaVersion` fields are absent and
the domain is `noema:evidence-leaf:v1`.

Evidence leaves are sorted lexicographically by their digest. A pair is formed
by sorting the two child digests lexicographically and hashing the canonical
object with the `domain`, `hashingVersion`, `left`, and `right` fields. An odd
final node is duplicated. An empty evidence set hashes the canonical object with
the `domain`, `hashingVersion`, and an empty `leaves` array. The merkle domain
is `noema:evidence-merkle:v1` for every hashing version; the `hashingVersion`
field distinguishes v1 and v2 merkle commitments.

This is a sorted Merkle commitment: leaf order in the input does not change
the evidence root, while leaf content and metadata remain committed.

## Replay contract

The same object projection, evidence set, package version, and hashing spec
version must produce the same objectRoot, evidence leaves, and evidenceRoot on
every supported runtime. A root computed under one hashing version is never
treated as equal to a root computed under another hashing version.
