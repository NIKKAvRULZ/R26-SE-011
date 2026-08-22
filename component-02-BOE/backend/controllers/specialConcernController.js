const FinalResult = require("../models/FinalResult");
const { generateResultHash } = require("../utils/hashGenerator");

// =======================================
// SPECIAL CONCERN DIRECT UPDATE
// =======================================

exports.directUpdateFinalResult = async (req, res) => {
  try {
    // =======================================
    // LOG INCOMING PAYLOAD
    // =======================================

    console.log("\n========================================");
    console.log("🚨 SPECIAL CONCERN PAYLOAD RECEIVED");
    console.log("========================================");

    console.dir(req.body, {
      depth: null,
      colors: true,
    });

    console.log("========================================\n");

    // =======================================
    // EXTRACT PAYLOAD
    // =======================================

    const { metadata, records } = req.body;

    // =======================================
    // BASIC VALIDATION
    // =======================================

    if (!metadata || !records) {
      return res.status(400).json({
        message: "Invalid payload. Metadata and records are required.",
      });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({
        message: "Records must be an array.",
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

    // =======================================
    // VERIFY SPECIAL CONCERN
    // =======================================

    if (metadata.isRecorrection !== true) {
      return res.status(400).json({
        message: "This endpoint only accepts Special Concern updates.",
      });
    }

    // =======================================
    // NORMALIZE MODULE CODE
    // =======================================

    const moduleCode = metadata.moduleCode.trim().toUpperCase();

    let updated = 0;
    let skipped = 0;

    // =======================================
    // PROCESS EACH RECORD
    // =======================================

    for (const record of records) {
      const candidateId = record.candidateId;
      const gradingData = record.gradingData;

      // =======================================
      // VALIDATE RECORD
      // =======================================

      if (!candidateId || !gradingData) {
        console.log("⚠️ Invalid Special Concern record:", record);

        skipped++;
        continue;
      }

      // =======================================
      // FIND EXISTING FINAL RESULT
      // =======================================

      const finalResult = await FinalResult.findOne({
        candidateId,
        moduleCode,
      });

      if (!finalResult) {
        console.log(
          `⚠️ FinalResult not found for ${candidateId} - ${moduleCode}`,
        );

        skipped++;
        continue;
      }

      // =======================================
      // EXTRACT NEW MARKS
      // =======================================

      const possibleMarks =
        gradingData["Final Marks"] ??
        gradingData["FinalMarks"] ??
        gradingData["Marks"] ??
        gradingData["New Marks"] ??
        gradingData["Appealed Marks"];

      const newMarks =
        possibleMarks !== undefined ? Number(possibleMarks) : finalResult.marks;

      // =======================================
      // VALIDATE MARKS
      // =======================================

      if (Number.isNaN(newMarks) || newMarks < 0 || newMarks > 100) {
        console.log(`⚠️ Invalid marks for ${candidateId}`);

        skipped++;
        continue;
      }

      // =======================================
      // EXTRACT NEW GRADE
      // =======================================

      const newGrade =
        gradingData["Appealed Grade"] ??
        gradingData["Final Grade"] ??
        gradingData["Overall Grade"] ??
        gradingData["Grade"];

      if (!newGrade) {
        console.log(`⚠️ No updated grade found for ${candidateId}`);

        skipped++;
        continue;
      }

      // =======================================
      // CURRENT VERSION
      // =======================================

      const previousVersion = finalResult.version;

      // =======================================
      // PRESERVE HISTORY
      // =======================================

      finalResult.history.push({
        version: previousVersion,

        oldMarks: finalResult.marks,
        newMarks,

        oldGrade: finalResult.grade,
        newGrade,

        editedBy: metadata.uploaderName || "Component 3",

        reason: "Special Concern Correction",

        editedAt: new Date(),
      });

      // =======================================
      // UPDATE RESULT
      // =======================================

      finalResult.marks = newMarks;

      finalResult.grade = newGrade;

      // =======================================
      // UPDATE GRADING DATA
      // =======================================

      finalResult.gradingData = gradingData;

      // =======================================
      // INCREMENT VERSION
      // =======================================

      finalResult.version += 1;

      // =======================================
      // GENERATE NEW HASH
      // =======================================

      const newHash = generateResultHash({
        candidateId: finalResult.candidateId,
        moduleCode: finalResult.moduleCode,
        marks: finalResult.marks,
        grade: finalResult.grade,
        version: finalResult.version,
      });

      finalResult.hash = newHash;

      // =======================================
      // RESET BLOCKCHAIN STATUS
      // =======================================

      finalResult.blockchainStatus = "PENDING";

      // =======================================
      // UPDATE PROVENANCE
      // =======================================

      finalResult.provenanceHash = metadata.provenanceHash;

      finalResult.payloadHash = metadata.provenanceHash;

      // =======================================
      // SAVE
      // =======================================

      await finalResult.save();

      updated++;

      console.log(`✅ Special Concern applied: ${candidateId} - ${moduleCode}`);

      console.log(`   Version: ${previousVersion} → ${finalResult.version}`);

      console.log(
        `   Grade: ${finalResult.history[finalResult.history.length - 1].oldGrade} → ${newGrade}`,
      );

      console.log(`   New Hash: ${newHash}`);

      console.log(
        `   Blockchain eligible remains: ${finalResult.blockchainEligibleAt.toISOString()}`,
      );
    }

    // =======================================
    // RESPONSE
    // =======================================

    console.log("\n========================================");
    console.log("📊 SPECIAL CONCERN SUMMARY");
    console.log("========================================");
    console.log(`Module: ${moduleCode}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log("========================================\n");

    res.status(200).json({
      message: "Special Concern processing completed.",

      moduleCode,

      updated,

      skipped,
    });
  } catch (error) {
    console.error("❌ Special Concern update error:", error);

    res.status(500).json({
      message: "Server Error",
    });
  }
};