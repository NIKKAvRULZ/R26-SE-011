// component-02-BOE/backend/jobs/finalizationJob.js
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { finalizeExpiredResults } = require("../services/finalizationService");

// =======================================
// DYNAMIC POLICY READER FOR CRON
// =======================================
const getPolicyConfig = () => {
  try {
    const configPath = path.join(__dirname, "../../../component-03-silent-bridge/middleware/system-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("⚠️ Could not read policy for finalization job, defaulting to minutes.");
  }
  return { timeUnit: "minutes", boeReviewWindow: 2, specialConcernsWindow: 5 };
};

// =======================================
// AUTOMATIC FINALIZATION JOB
// =======================================

const startFinalizationJob = () => {
  // Run once when the server starts[cite: 5]
  runFinalization();

  // Run every minute (`* * * * *`) for real-time synchronization with Component 3 clock
  cron.schedule("* * * * *", async () => {
    await runFinalization();
  });

  console.log("⏰ Component 2 Synchronized Finalization Job Started.");
  console.log("   → Actively evaluating BOE lock and review thresholds every minute.");
};

// =======================================
// RUN FINALIZATION
// =======================================

const runFinalization = async () => {
  try {
    const policy = getPolicyConfig();
    console.log(`\n🔍 [Clock Sync] Scanning BOE records against active policy (${policy.boeReviewWindow} ${policy.timeUnit})...`);

    const result = await finalizeExpiredResults();

    if (result.finalized > 0 || result.skipped > 0) {
      console.log(
        `✅ Finalization sync complete -> Transferred to Final Database: Finalized: ${result.finalized}, Skipped: ${result.skipped}`,
      );
    }
  } catch (error) {
    console.error("❌ Automatic finalization sync failed:", error);
  }
};

module.exports = {
  startFinalizationJob,
};