const cron = require("node-cron");

const FinalResult = require("../models/FinalResult");
const { sendHashToComponent1 } = require("../services/blockchainService");

// =======================================
// AUTOMATIC BLOCKCHAIN JOB
// =======================================
//
// Checks FinalResult records whose
// 7-day final holding period has expired.
//
// Those hashes are sent to Component 1.
//
// =======================================

const startBlockchainJob = () => {
  // Run once when server starts
  runBlockchainSync();

  // Production:
  // Run every hour
  cron.schedule("0 * * * *", async () => {
    await runBlockchainSync();
  });

  console.log("⛓️ Blockchain synchronization job started.");
  console.log("   → Checking blockchain-eligible results every hour.");
};

// =======================================
// RUN BLOCKCHAIN SYNC
// =======================================

const runBlockchainSync = async () => {
  try {
    console.log("\n🔍 Checking for blockchain-eligible results...");

    const now = new Date();

    const eligibleResults = await FinalResult.find({
      blockchainEligibleAt: {
        $lte: now,
      },

      blockchainStatus: {
        $in: ["PENDING", "READY"],
      },
    });

    if (eligibleResults.length === 0) {
      console.log("ℹ️ No blockchain-eligible results found.");

      return;
    }

    console.log(
      `🔗 Found ${eligibleResults.length} blockchain-eligible result(s).`,
    );

    let stored = 0;
    let failed = 0;

    for (const result of eligibleResults) {
      try {
        // =======================================
        // MARK AS READY
        // =======================================

        if (result.blockchainStatus === "PENDING") {
          result.blockchainStatus = "READY";

          await result.save();
        }

        // =======================================
        // SEND TO COMPONENT 1
        // =======================================

        await sendHashToComponent1({
          candidateId: result.candidateId,
          hash: result.hash,
        });

        // =======================================
        // MARK AS STORED
        // =======================================

        result.blockchainStatus = "STORED";

        result.blockchainStoredAt = new Date();

        await result.save();

        stored++;

        console.log(
          `✅ Blockchain hash stored: ${result.candidateId} - ${result.moduleCode}`,
        );
      } catch (error) {
        failed++;

        console.error(
          `❌ Failed to store hash for ${result.candidateId}:`,
          error.message,
        );

        // Keep it READY so the next job can retry.
        result.blockchainStatus = "READY";

        await result.save();
      }
    }

    console.log("\n=======================================");
    console.log("📊 BLOCKCHAIN SYNC SUMMARY");
    console.log("=======================================");
    console.log("Successfully stored:", stored);
    console.log("Failed:", failed);
    console.log("=======================================\n");
  } catch (error) {
    console.error("❌ Blockchain synchronization failed:", error);
  }
};

module.exports = {
  startBlockchainJob,
};