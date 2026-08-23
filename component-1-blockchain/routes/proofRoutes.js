const express = require("express");

const router = express.Router();

const proofController =
    require("../controllers/proofController");


// =====================================================
// GENERATE PROOF
// =====================================================
//
// POST /generate-proof
//
// Used for standalone testing / frontend demonstration.
// =====================================================

router.post(
    "/generate-proof",
    proofController.generateProofManifest
);


// =====================================================
// COMPONENT 2 INTEGRATION
// =====================================================
//
// POST /blockchain/storeHash
//
// Component 2 sends finalized records here.
// =====================================================

router.post(
    "/blockchain/storeHash",
    proofController.generateProofManifest
);


// =====================================================
// GET LATEST ANCHORED PROOF
// =====================================================
//
// GET /proof/latest
//
// Returns the most recently anchored:
// - Merkle Root
// - IPFS CID
// - timestamp
// - uploader
//
// This allows the frontend / Component 4 to discover
// the current official Merkle Root automatically.
// =====================================================

router.get(
    "/proof/latest",
    proofController.getLatestProof
);


// =====================================================
// READ BLOCKCHAIN PROOF BY MERKLE ROOT
// =====================================================
//
// GET /proof/:merkleRoot
//
// Returns:
// - Merkle Root
// - IPFS CID
// - timestamp
// - uploader
// =====================================================

router.get(
    "/proof/:merkleRoot",
    proofController.getAnchoredProof
);


// =====================================================
// GET FINALIZED IPFS DATA
// =====================================================
//
// GET /proof/:merkleRoot/data
//
// Used by Component 4.
// =====================================================

router.get(
    "/proof/:merkleRoot/data",
    proofController.getProofData
);


// =====================================================
// GET STUDENT MERKLE PROOF
// =====================================================
//
// POST /proof/merkle-proof
//
// Used by Component 4.
// =====================================================

router.post(
    "/proof/merkle-proof",
    proofController.getStudentMerkleProof
);


module.exports = router;