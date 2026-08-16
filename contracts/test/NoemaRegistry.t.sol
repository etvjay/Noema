// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NoemaRegistry} from "../src/NoemaRegistry.sol";

contract NoemaRegistryTest is Test {
    NoemaRegistry private registry;

    function setUp() public {
        registry = new NoemaRegistry();
    }

    function testRegisterAndUpdateObjectWithExpectedVersion() public {
        bytes32 objectId = keccak256("object");
        bytes32 objectRoot = keccak256("root-v1");
        bytes32 evidenceRoot = keccak256("evidence-v1");

        registry.registerObject(objectId, objectRoot, evidenceRoot);
        (bytes32 storedObjectRoot, bytes32 storedEvidenceRoot, uint64 version,, bool active) =
            registry.objects(objectId);

        assertEq(storedObjectRoot, objectRoot);
        assertEq(storedEvidenceRoot, evidenceRoot);
        assertEq(version, 1);
        assertTrue(active);

        registry.updateObject(objectId, 1, keccak256("root-v2"), keccak256("evidence-v2"));
        (,, uint64 nextVersion,,) = registry.objects(objectId);
        assertEq(nextVersion, 2);
    }

    function testHistoricalCommitmentsRemainImmutableAcrossUpdates() public {
        bytes32 objectId = keccak256("object-history");
        bytes32 objectRootV1 = keccak256("root-v1");
        bytes32 evidenceRootV1 = keccak256("evidence-v1");
        bytes32 objectRootV2 = keccak256("root-v2");
        bytes32 evidenceRootV2 = keccak256("evidence-v2");

        registry.registerObject(objectId, objectRootV1, evidenceRootV1);
        registry.updateObject(objectId, 1, objectRootV2, evidenceRootV2);

        (bytes32 historyObjectRootV1, bytes32 historyEvidenceRootV1, uint64 historyVersionV1,, bool activeV1) =
            registry.commitmentHistory(objectId, 1);
        (bytes32 historyObjectRootV2, bytes32 historyEvidenceRootV2, uint64 historyVersionV2,, bool activeV2) =
            registry.commitmentHistory(objectId, 2);

        assertEq(historyObjectRootV1, objectRootV1);
        assertEq(historyEvidenceRootV1, evidenceRootV1);
        assertEq(historyVersionV1, 1);
        assertTrue(activeV1);

        assertEq(historyObjectRootV2, objectRootV2);
        assertEq(historyEvidenceRootV2, evidenceRootV2);
        assertEq(historyVersionV2, 2);
        assertTrue(activeV2);

        (bytes32 latestObjectRoot, bytes32 latestEvidenceRoot, uint64 latestVersion,, bool latestActive) =
            registry.objects(objectId);
        assertEq(latestObjectRoot, objectRootV2);
        assertEq(latestEvidenceRoot, evidenceRootV2);
        assertEq(latestVersion, 2);
        assertTrue(latestActive);
    }

    function testRejectsStaleUpdate() public {
        bytes32 objectId = keccak256("object");
        registry.registerObject(objectId, keccak256("root"), keccak256("evidence"));

        vm.expectRevert(NoemaRegistry.InvalidExpectedVersion.selector);
        registry.updateObject(objectId, 0, keccak256("root-v2"), keccak256("evidence-v2"));
    }

    function testAttestationCanBeRevoked() public {
        bytes32 objectId = keccak256("object");
        bytes32 claimId = keccak256("claim");
        bytes32 attestationHash = keccak256("attestation");
        registry.registerObject(objectId, keccak256("root"), keccak256("evidence"));

        registry.attestClaim(objectId, claimId, attestationHash);
        assertEq(registry.claimAttestations(objectId, claimId), attestationHash);
        registry.revokeAttestation(objectId, claimId, attestationHash);
        assertTrue(registry.revokedAttestations(objectId, claimId, attestationHash));
    }
}
