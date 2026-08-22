// component-02-BOE/backend/jobs/finalizationJob.js
const { finalizeExpiredResults } = require("../services/finalizationService");

const startFinalizationJob = () => {
  // Run once on server startup
  runFinalization();

  // Run every 30 seconds for instant finalization checks
  setInterval(async () => {
    await runFinalization();
  }, 30000);

  console.log("⏰ Component 2 Synchronized Finalization Job Started.");
  console.log("   → Actively evaluating BOE review thresholds every 30 seconds.");
};

const runFinalization = async () => {
  try {
    const result = await finalizeExpiredResults();
    if (result && (result.finalized > 0 || result.skipped > 0)) {
      console.log(
        `✅ Finalization sync complete -> Transferred to Final Database: Finalized: ${result.finalized}, Skipped: ${result.skipped}`,
      );
    }
  } catch (error) {
    console.error("❌ Automatic finalization failed:", error);
  }
};

module.exports = {
  startFinalizationJob,
};