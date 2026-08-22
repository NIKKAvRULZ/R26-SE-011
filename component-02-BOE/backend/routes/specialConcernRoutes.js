const express = require("express");

const router = express.Router();

const {
  directUpdateFinalResult,
} = require("../controllers/specialConcernController");

// SPECIAL CONCERN DIRECT UPDATE
router.post("/boe/direct-update", directUpdateFinalResult);

module.exports = router;