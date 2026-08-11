const express = require("express");
const router = express.Router();
const proofController = require("../controllers/proofController");

// Triggers the controller method at POST http://localhost:3000/generate-proof
router.post("/generate-proof", proofController.generateProofManifest);

module.exports = router;