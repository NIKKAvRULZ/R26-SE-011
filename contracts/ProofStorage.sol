// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProofStorage {

    // =====================================================
    // PROOF DATA
    // =====================================================

    struct RecordProof {
        string ipfsCID;
        uint256 timestamp;
        address uploadedBy;
    }


    // =====================================================
    // STORAGE
    // =====================================================

    mapping(bytes32 => RecordProof) private proofs;

    // Keeps track of the most recently anchored Merkle Root.
    bytes32 private latestMerkleRoot;


    // =====================================================
    // EVENTS
    // =====================================================

    event ProofAnchored(
        bytes32 indexed merkleRoot,
        string ipfsCID,
        address uploadedBy
    );


    // =====================================================
    // STORE PROOF
    // =====================================================

    function storeProof(
        bytes32 _merkleRoot,
        string memory _ipfsCID
    )
        public
    {
        require(
            proofs[_merkleRoot].timestamp == 0,
            "Error: This Merkle Root proof has already been anchored."
        );

        require(
            bytes(_ipfsCID).length > 0,
            "Error: IPFS CID cannot be empty."
        );


        // Store proof under the Merkle Root.
        proofs[_merkleRoot] = RecordProof({
            ipfsCID: _ipfsCID,
            timestamp: block.timestamp,
            uploadedBy: msg.sender
        });


        // Update the latest anchored Merkle Root.
        latestMerkleRoot = _merkleRoot;


        emit ProofAnchored(
            _merkleRoot,
            _ipfsCID,
            msg.sender
        );
    }


    // =====================================================
    // GET PROOF BY MERKLE ROOT
    // =====================================================

    function getProof(
        bytes32 _merkleRoot
    )
        public
        view
        returns (
            string memory ipfsCID,
            uint256 timestamp,
            address uploadedBy
        )
    {
        RecordProof memory proof =
            proofs[_merkleRoot];


        require(
            proof.timestamp > 0,
            "Proof not found for the provided Merkle Root."
        );


        return (
            proof.ipfsCID,
            proof.timestamp,
            proof.uploadedBy
        );
    }


    // =====================================================
    // GET LATEST PROOF
    // =====================================================
    //
    // Returns the most recently anchored proof.
    //
    // This allows Component 1's frontend and Component 4
    // to discover the current official Merkle Root without
    // manually entering it.
    //
    // =====================================================

    function getLatestProof()
        public
        view
        returns (
            bytes32 merkleRoot,
            string memory ipfsCID,
            uint256 timestamp,
            address uploadedBy
        )
    {
        require(
            latestMerkleRoot != bytes32(0),
            "No proof has been anchored yet."
        );


        RecordProof memory proof =
            proofs[latestMerkleRoot];


        require(
            proof.timestamp > 0,
            "Latest proof not found."
        );


        return (
            latestMerkleRoot,
            proof.ipfsCID,
            proof.timestamp,
            proof.uploadedBy
        );
    }
}