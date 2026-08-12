const express = require("express");

const router = express.Router();

const { importResults } = require("../controllers/importController");

router.post(
  "/boe/ingest",

  importResults,
);

module.exports = router;
