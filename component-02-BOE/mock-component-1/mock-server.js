const express = require("express");
const cors = require("cors");

const app = express();

const PORT = 6000;

app.use(cors());
app.use(express.json());

// =======================================
// RECEIVE FINAL RESULTS FROM COMPONENT 2
// =======================================

app.post("/blockchain/storeHash", (req, res) => {
  console.log("\n=======================================");
  console.log("🔗 COMPONENT 1 RECEIVED FINAL RESULTS");
  console.log("=======================================");

  console.dir(req.body, {
    depth: null,
    colors: true,
  });

  console.log("=======================================\n");

  // =======================================
  // EXTRACT RECORDS
  // =======================================

  const { records } = req.body;

  // =======================================
  // VALIDATION
  // =======================================

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      success: false,
      message: "records must be a non-empty array.",
    });
  }

  // =======================================
  // VALIDATE EACH RECORD
  // =======================================

  for (const record of records) {
    const { candidateId, moduleCode, marks, grade, version, hash } = record;

    if (
      !candidateId ||
      !moduleCode ||
      marks === undefined ||
      !grade ||
      version === undefined ||
      !hash
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Each record must contain candidateId, moduleCode, marks, grade, version and hash.",
      });
    }
  }

  // =======================================
  // SUCCESS
  // =======================================

  console.log(`✅ Successfully received ${records.length} record(s).`);

  records.forEach((record) => {
    console.log(
      `   ${record.candidateId} - ${record.moduleCode} - ${record.grade} - v${record.version}`,
    );
  });

  res.status(200).json({
    success: true,
    message: "Final results successfully received by Component 1.",
    received: records.length,
    records: records.map((record) => ({
      candidateId: record.candidateId,
      moduleCode: record.moduleCode,
      version: record.version,
      hash: record.hash,
    })),
  });
});

// =======================================
// START SERVER
// =======================================

app.listen(PORT, () => {
  console.log(`🔗 Mock Component 1 running on http://localhost:${PORT}`);

  console.log(
    `   Endpoint: POST http://localhost:${PORT}/blockchain/storeHash`,
  );
});
