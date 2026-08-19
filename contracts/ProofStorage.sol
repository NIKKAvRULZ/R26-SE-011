// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProofStorage {
    struct RecordProof {
        string ipfsCID;
        uint256 timestamp;
        address uploadedBy;
    }

    mapping(bytes32 => RecordProof) private proofs;

    event ProofAnchored(bytes32 indexed merkleRoot, string ipfsCID, address uploadedBy);

    function storeProof(bytes32 _merkleRoot, string memory _ipfsCID) public {
        require(proofs[_merkleRoot].timestamp == 0, "Error: This Merkle Root proof has already been anchored.");
        require(bytes(_ipfsCID).length > 0, "Error: IPFS CID cannot be empty.");

        proofs[_merkleRoot] = RecordProof({
            ipfsCID: _ipfsCID,
            timestamp: block.timestamp,
            uploadedBy: msg.sender
        });

        emit ProofAnchored(_merkleRoot, _ipfsCID, msg.sender);
    }

    function getProof(bytes32 _merkleRoot) public view returns (string memory ipfsCID, uint256 timestamp, address uploadedBy) {
        RecordProof memory proof = proofs[_merkleRoot];
        require(proof.timestamp > 0, "Proof not found for the provided Merkle Root.");
        return (proof.ipfsCID, proof.timestamp, proof.uploadedBy);
    }
}