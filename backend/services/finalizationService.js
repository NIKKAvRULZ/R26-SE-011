const Result = require("../models/Result");
const FinalResult = require("../models/FinalResult");
const { generateResultHash } = require("../utils/hashGenerator");

// =======================================
// CONFIGURATION
// =======================================

const BOE_REVIEW_DAYS = Number(process.env.BOE_REVIEW_DAYS || 7);

const FINAL_HOLD_DAYS = Number(process.env.FINAL_HOLD_DAYS || 7);

// =======================================
// FINALIZE EXPIRED BOE RESULTS
// =======================================

const finalizeExpiredResults = async () => {
  try {
    const now = new Date();

    const deadline = new Date(
      now.getTime() - BOE_REVIEW_DAYS * 24 * 60 * 60 * 1000,
    );

    // =======================================
    // FIND EXPIRED RESULTS
    // =======================================

    const expiredResults = await Result.find({
      releaseDate: {
        $lte: deadline,
      },

      finalized: false,
    }).lean();

    if (expiredResults.length === 0) {
      return {
        finalized: 0,
        skipped: 0,
      };
    }

    console.log(`\n🔒 Found ${expiredResults.length} expired BOE result(s).`);

    let finalized = 0;
    let skipped = 0;

    // =======================================
    // PROCESS EACH RESULT
    // =======================================

    for (const result of expiredResults) {
      // =======================================
      // CHECK IF ALREADY FINALIZED
      // =======================================

      const existingFinal = await FinalResult.findOne({
        candidateId: result.candidateId,
        moduleCode: result.moduleCode,
      });

      if (existingFinal) {
        skipped++;

        continue;
      }

      // =======================================
      // FINALIZATION TIME
      // =======================================

      const finalizedAt = new Date();

      const blockchainEligibleAt = new Date(
        finalizedAt.getTime() + FINAL_HOLD_DAYS * 24 * 60 * 60 * 1000,
      );

      // =======================================
      // GENERATE STUDENT HASH
      // =======================================

      const hash = generateResultHash({
        candidateId: result.candidateId,
        moduleCode: result.moduleCode,
        marks: result.marks,
        grade: result.grade,
        version: result.version,
      });

      // =======================================
      // CREATE FINAL RESULT
      // =======================================

      const finalResult = new FinalResult({
        candidateId: result.candidateId,

        moduleCode: result.moduleCode,

        marks: result.marks,

        grade: result.grade,

        gradingData: result.gradingData,

        uploader: result.uploader,

        provenanceHash: result.provenanceHash,

        payloadHash: result.payloadHash,

        version: result.version,

        history: result.history || [],

        finalizedAt,

        blockchainEligibleAt,

        hash,

        blockchainStatus: "PENDING",
      });

      // =======================================
      // SAVE
      // =======================================

      await finalResult.save();

      await finalResult.save();

      await Result.updateOne(
        {
          _id: result._id,
        },
        {
          $set: {
            finalized: true,
          },
        },
      );

      finalized++;

      finalized++;

      console.log(`✅ Finalized: ${result.candidateId} - ${result.moduleCode}`);

      console.log(`   Version: ${result.version}`);

      console.log(`   Hash: ${hash}`);

      console.log(
        `   Blockchain eligible: ${blockchainEligibleAt.toISOString()}`,
      );
    }

    console.log(
      `\n📊 Finalization complete. Finalized: ${finalized}, Skipped: ${skipped}\n`,
    );

    return {
      finalized,
      skipped,
    };
  } catch (error) {
    console.error("❌ Finalization service error:", error);

    throw error;
  }
};

module.exports = {
  finalizeExpiredResults,
};
