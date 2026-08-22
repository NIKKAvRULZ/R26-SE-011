const cron = require("node-cron");

const { finalizeExpiredResults } = require("../services/finalizationService");

// =======================================
// AUTOMATIC FINALIZATION JOB
// =======================================
//
// Runs every hour.
//
// It checks for Result records whose
// 7-day BOE review period has expired.
//
// =======================================

const startFinalizationJob = () => {
  // Run once when the server starts
  runFinalization();

  // Then run every hour
  cron.schedule("* * * * *", async () => {
    await runFinalization();
  });

  console.log("⏰ Finalization job started.");
  console.log("   → Checking expired BOE results every hour.");
};

// =======================================
// RUN FINALIZATION
// =======================================

const runFinalization = async () => {
  try {
    console.log("\n🔍 Checking for expired BOE results...");

    const result = await finalizeExpiredResults();

    console.log(
      `✅ Finalization check complete. Finalized: ${result.finalized}, Skipped: ${result.skipped}`,
    );
  } catch (error) {
    console.error("❌ Automatic finalization failed:", error);
  }
};

module.exports = {
  startFinalizationJob,
};
