const { finalizeExpiredResults } = require("../services/finalizationService");

const JOB_INTERVAL = 5000; // 5 seconds

const startFinalizationJob = () => {
  // Run once when server starts
  runFinalization();

  // Check every 5 seconds
  setInterval(async () => {
    await runFinalization();
  }, JOB_INTERVAL);

  console.log("⏰ Component 2 Synchronized Finalization Job Started.");
  console.log("   → Evaluating BOE review thresholds every 5 seconds.");
};

const runFinalization = async () => {
  try {
    const result = await finalizeExpiredResults();

    if (result && (result.finalized > 0 || result.skipped > 0)) {
      console.log(
        `✅ Finalization sync complete -> Transferred to Final Database: ` +
          `Finalized: ${result.finalized}, Skipped: ${result.skipped}`,
      );
    }
  } catch (error) {
    console.error("❌ Automatic finalization failed:", error);
  }
};

module.exports = {
  startFinalizationJob,
};
