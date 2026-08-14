# Noema canonical hashing specification

Status: E1 implementation contract. The algorithms below are deterministic
and tested locally; production and X Layer claims remain E0 until deployed and
independently replayed.

## Domain and algorithm

- Canonical serialization: RFC 8785 JSON Canonicalization Scheme (JCS).
- Text encoding: UTF-8.
- Digest: Keccak-256, represented as lowercase 0x-prefixed hexadecimal.
- Object domain: noema:economic-object:v1.
- Evidence leaf domain: noema:evidence-leaf:v1.
- Merkle domain: noema:evidence-merkle:v1.

The implementation must reject values that cannot be represented as valid JSON
and must never use arbitrary JSON.stringify output as canonical JSON.

## Economic object projection

The object root hashes this projection:

~~~text
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

Arrays are sorted by their stable id where the object model provides one. The
reducer is responsible for producing already-normalized arrays before hashing.
The canonicalization package does not silently reorder semantic arrays.

## Evidence leaves

Each evidence leaf hashes the canonical object:

~~~json
{
  "domain": "noema:evidence-leaf:v1",
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

Evidence leaves are sorted lexicographically by their digest. A pair is formed
by sorting the two child digests lexicographically and hashing the canonical
object with domain, left, and right fields. An odd final node is duplicated.
An empty evidence set hashes the canonical object with the domain and an empty
leaves array.

This is a sorted Merkle commitment: leaf order in the input does not change
the evidence root, while leaf content and metadata remain committed.

## Replay contract

The same object projection, evidence set, package version, and hashing spec
version must produce the same objectRoot, evidence leaves, and evidenceRoot on
every supported runtime.
