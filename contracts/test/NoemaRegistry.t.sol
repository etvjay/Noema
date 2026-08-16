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

        _assertHistoricalCommitment(objectId, 1, objectRootV1, evidenceRootV1);
        _assertHistoricalCommitment(objectId, 2, objectRootV2, evidenceRootV2);
        _assertLatestCommitment(objectId, 2, objectRootV2, evidenceRootV2);
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

    function _assertHistoricalCommitment(
        bytes32 objectId,
        uint64 expectedVersion,
        bytes32 expectedObjectRoot,
        bytes32 expectedEvidenceRoot
    ) private view {
        (bytes32 objectRoot, bytes32 evidenceRoot, uint64 version,, bool active) =
            registry.commitmentHistory(objectId, expectedVersion);
        assertEq(objectRoot, expectedObjectRoot);
        assertEq(evidenceRoot, expectedEvidenceRoot);
        assertEq(version, expectedVersion);
        assertTrue(active);
    }

    function _assertLatestCommitment(
        bytes32 objectId,
        uint64 expectedVersion,
        bytes32 expectedObjectRoot,
        bytes32 expectedEvidenceRoot
    ) private view {
        (bytes32 objectRoot, bytes32 evidenceRoot, uint64 version,, bool active) = registry.objects(objectId);
        assertEq(objectRoot, expectedObjectRoot);
        assertEq(evidenceRoot, expectedEvidenceRoot);
        assertEq(version, expectedVersion);
        assertTrue(active);
    }
}
