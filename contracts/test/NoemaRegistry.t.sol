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
