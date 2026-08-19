const cron = require("node-cron");

const FinalResult = require("../models/FinalResult");
const { sendResultsToComponent1 } = require("../services/blockchainService");


// AUTOMATIC BLOCKCHAIN JOB
//
// Checks FinalResult records whose
// final 7-day holding period has expired.
//
// Eligible finalized results are sent to
// Component 1 as a batch.


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

    // =======================================
    // FIND ELIGIBLE FINAL RESULTS
    // =======================================

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

    // =======================================
    // MARK RESULTS AS READY
    // =======================================

    for (const result of eligibleResults) {
      if (result.blockchainStatus === "PENDING") {
        result.blockchainStatus = "READY";

        await result.save();
      }
    }

    // =======================================
    // SEND BATCH TO COMPONENT 1
    // =======================================

    try {
      await sendResultsToComponent1(eligibleResults);

      // =======================================
      // MARK ALL AS STORED
      // =======================================

      for (const result of eligibleResults) {
        result.blockchainStatus = "STORED";

        result.blockchainStoredAt = new Date();

        await result.save();
      }

      console.log(
        `✅ Successfully sent ${eligibleResults.length} result(s) to Component 1.`,
      );
    } catch (error) {
      // =======================================
      // BATCH SEND FAILED
      // =======================================

      console.error("❌ Failed to send results to Component 1:", error.message);

      // Keep records as READY.
      // The next scheduled job will retry them.

      for (const result of eligibleResults) {
        result.blockchainStatus = "READY";

        await result.save();
      }

      console.log("🔄 Results remain READY and will be retried.");

      return;
    }

    // =======================================
    // SUMMARY
    // =======================================

    console.log("\n=======================================");
    console.log("📊 BLOCKCHAIN SYNC SUMMARY");
    console.log("=======================================");
    console.log("Successfully sent:", eligibleResults.length);
    console.log("Failed:", 0);
    console.log("=======================================\n");
  } catch (error) {
    console.error("❌ Blockchain synchronization failed:", error);
  }
};

module.exports = {
  startBlockchainJob,
};