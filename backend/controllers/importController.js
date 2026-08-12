const Result = require("../models/Result");

exports.importResults = async (req, res) => {
  try {
    // =========================================
    // LOG INCOMING COMPONENT 3 PAYLOAD
    // =========================================

    console.log("\n========================================");
    console.log("📥 COMPONENT 3 PAYLOAD RECEIVED");
    console.log("========================================");

    console.dir(req.body, {
      depth: null,
      colors: true,
    });

    console.log("========================================\n");

    // =========================================
    // EXTRACT PAYLOAD
    // =========================================

    const { metadata, records } = req.body;

    // =========================================
    // BASIC VALIDATION
    // =========================================

    if (!metadata || !records) {
      return res.status(400).json({
        message: "Invalid payload. Metadata and records are required.",
      });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({
        message: "Invalid payload. Records must be an array.",
      });
    }

    if (!metadata.moduleCode) {
      return res.status(400).json({
        message: "Module code is required.",
      });
    }

    if (!metadata.provenanceHash) {
      return res.status(400).json({
        message: "Provenance hash is required.",
      });
    }

    // =========================================
    // RE-CORRECTION PROTECTION
    // =========================================

    if (metadata.isRecorrection === true) {
      return res.status(403).json({
        message: "Re-correction records are not handled by the BOE layer.",
      });
    }

    // =========================================
    // NORMALIZE MODULE CODE
    // =========================================

    const moduleCode = metadata.moduleCode.trim().toUpperCase();

    let imported = 0;
    let skipped = 0;

    // =========================================
    // PROCESS EACH RECORD
    // =========================================

    for (const record of records) {
      const candidateId = record.candidateId;
      const gradingData = record.gradingData;

      // -----------------------------------------
      // Validate individual record
      // -----------------------------------------

      if (!candidateId || !gradingData) {
        console.log("⚠️ Skipping invalid record:", record);

        skipped++;

        continue;
      }

      // =========================================
      // EXTRACT MARKS
      // =========================================

      const marks = Number(
        gradingData["Final Marks"] ??
          gradingData["FinalMarks"] ??
          gradingData["Marks"] ??
          0,
      );

      // =========================================
      // EXTRACT GRADE
      // =========================================

      const grade =
        gradingData["Overall Grade"] ??
        gradingData["Final Grade"] ??
        gradingData["Grade"] ??
        "";

      // =========================================
      // CHECK DUPLICATE
      // =========================================

      const exists = await Result.findOne({
        candidateId,
        moduleCode,
        provenanceHash: metadata.provenanceHash,
      });

      if (exists) {
        console.log(`⚠️ Duplicate skipped: ${candidateId}`);

        skipped++;

        continue;
      }

      // =========================================
      // CREATE RESULT
      // =========================================

      const newResult = new Result({
        candidateId,

        moduleCode,

        marks,

        grade,

        gradingData,

        uploader: metadata.uploaderName || "Unknown",

        provenanceHash: metadata.provenanceHash,

        payloadHash: metadata.provenanceHash,

        isRecorrection: false,

        version: 1,

        history: [],
      });

      // =========================================
      // SAVE TO MONGODB
      // =========================================

      await newResult.save();

      imported++;

      console.log(`✅ Imported: ${candidateId} - ${moduleCode}`);
    }

    // =========================================
    // RESPONSE
    // =========================================

    console.log("\n========================================");
    console.log("📊 COMPONENT 3 IMPORT SUMMARY");
    console.log("========================================");
    console.log(`Module: ${moduleCode}`);
    console.log(`Imported: ${imported}`);
    console.log(`Skipped: ${skipped}`);
    console.log("========================================\n");

    res.status(201).json({
      message: "Results imported successfully.",

      moduleCode,

      imported,

      skipped,
    });
  } catch (error) {
    console.error("❌ Component 3 import error:", error);

    res.status(500).json({
      message: "Server Error",
    });
  }
};
