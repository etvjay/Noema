// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

contract NoemaRegistry {
    struct ObjectCommitment {
        bytes32 objectRoot;
        bytes32 evidenceRoot;
        uint64 version;
        uint64 updatedAt;
        bool active;
    }

    error Unauthorized();
    error Paused();
    error ObjectAlreadyRegistered();
    error ObjectNotFound();
    error InvalidExpectedVersion();
    error InvalidRoot();
    error AttestationNotFound();

    address public immutable admin;
    bool public paused;

    mapping(address => bool) public publishers;
    mapping(address => bool) public attestors;
    mapping(bytes32 => ObjectCommitment) public objects;
    mapping(bytes32 => mapping(uint64 => ObjectCommitment)) public commitmentHistory;
    mapping(bytes32 => mapping(bytes32 => bytes32)) public claimAttestations;
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => bool))) public revokedAttestations;
    mapping(bytes32 => mapping(bytes32 => bytes32)) public representations;

    event ObjectRegistered(bytes32 indexed objectId, uint64 version, bytes32 objectRoot, bytes32 evidenceRoot);
    event ObjectUpdated(
        bytes32 indexed objectId, uint64 previousVersion, uint64 newVersion, bytes32 objectRoot, bytes32 evidenceRoot
    );
    event ClaimAttested(bytes32 indexed objectId, bytes32 indexed claimId, bytes32 attestationHash);
    event AttestationRevoked(bytes32 indexed objectId, bytes32 indexed claimId, bytes32 attestationHash);
    event RepresentationRegistered(
        bytes32 indexed objectId, bytes32 indexed representationId, bytes32 relationshipHash
    );

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyPublisher() {
        if (!publishers[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyAttestor() {
        if (!attestors[msg.sender]) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        admin = msg.sender;
        publishers[msg.sender] = true;
        attestors[msg.sender] = true;
    }

    function setPublisher(address account, bool allowed) external onlyAdmin {
        publishers[account] = allowed;
    }

    function setAttestor(address account, bool allowed) external onlyAdmin {
        attestors[account] = allowed;
    }

    function pause() external onlyAdmin {
        paused = true;
    }

    function unpause() external onlyAdmin {
        paused = false;
    }

    function registerObject(bytes32 objectId, bytes32 objectRoot, bytes32 evidenceRoot)
        external
        onlyPublisher
        whenNotPaused
    {
        if (objectRoot == bytes32(0) || evidenceRoot == bytes32(0)) {
            revert InvalidRoot();
        }
        if (objects[objectId].version != 0) {
            revert ObjectAlreadyRegistered();
        }

        ObjectCommitment memory commitment = ObjectCommitment({
            objectRoot: objectRoot,
            evidenceRoot: evidenceRoot,
            version: 1,
            updatedAt: uint64(block.timestamp),
            active: true
        });

        objects[objectId] = commitment;
        commitmentHistory[objectId][1] = commitment;

        emit ObjectRegistered(objectId, 1, objectRoot, evidenceRoot);
    }

    function updateObject(bytes32 objectId, uint64 expectedVersion, bytes32 newObjectRoot, bytes32 newEvidenceRoot)
        external
        onlyPublisher
        whenNotPaused
    {
        if (newObjectRoot == bytes32(0) || newEvidenceRoot == bytes32(0)) {
            revert InvalidRoot();
        }
        ObjectCommitment storage current = objects[objectId];
        if (current.version == 0) revert ObjectNotFound();
        if (current.version != expectedVersion) revert InvalidExpectedVersion();

        uint64 previousVersion = current.version;
        uint64 newVersion = previousVersion + 1;
        ObjectCommitment memory next = ObjectCommitment({
            objectRoot: newObjectRoot,
            evidenceRoot: newEvidenceRoot,
            version: newVersion,
            updatedAt: uint64(block.timestamp),
            active: true
        });

        objects[objectId] = next;
        commitmentHistory[objectId][newVersion] = next;

        emit ObjectUpdated(objectId, previousVersion, newVersion, newObjectRoot, newEvidenceRoot);
    }

    function attestClaim(bytes32 objectId, bytes32 claimId, bytes32 attestationHash)
        external
        onlyAttestor
        whenNotPaused
    {
        if (objects[objectId].version == 0) revert ObjectNotFound();
        if (attestationHash == bytes32(0)) revert InvalidRoot();
        claimAttestations[objectId][claimId] = attestationHash;
        revokedAttestations[objectId][claimId][attestationHash] = false;
        emit ClaimAttested(objectId, claimId, attestationHash);
    }

    function revokeAttestation(bytes32 objectId, bytes32 claimId, bytes32 attestationHash)
        external
        onlyAttestor
        whenNotPaused
    {
        if (claimAttestations[objectId][claimId] != attestationHash) {
            revert AttestationNotFound();
        }
        revokedAttestations[objectId][claimId][attestationHash] = true;
        emit AttestationRevoked(objectId, claimId, attestationHash);
    }

    function registerRepresentation(bytes32 objectId, bytes32 representationId, bytes32 relationshipHash)
        external
        onlyPublisher
        whenNotPaused
    {
        if (objects[objectId].version == 0) revert ObjectNotFound();
        if (relationshipHash == bytes32(0)) revert InvalidRoot();
        representations[objectId][representationId] = relationshipHash;
        emit RepresentationRegistered(objectId, representationId, relationshipHash);
    }
}
