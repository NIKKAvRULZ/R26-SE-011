const express = require("express");
const router = express.Router();

const proofController = require("../controllers/proofController");


// =====================================================
// EXISTING TEST / FRONTEND ENDPOINT
// =====================================================

router.post(
    "/generate-proof",
    proofController.generateProofManifest
);


// =====================================================
// COMPONENT 2 INTEGRATION ENDPOINT
// =====================================================

router.post(
    "/blockchain/storeHash",
    proofController.generateProofManifest
);


// =====================================================
// READ BLOCKCHAIN PROOF
// =====================================================

router.get(
    "/proof/:merkleRoot",
    proofController.getAnchoredProof
);


// =====================================================
// GET FINALIZED IPFS DATA
// FOR COMPONENT 4
// =====================================================

router.get(
    "/proof/:merkleRoot/data",
    proofController.getProofData
);


module.exports = router;