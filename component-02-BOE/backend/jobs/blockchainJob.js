// component-02-BOE/backend/jobs/blockchainJob.js
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const FinalResult = require("../models/FinalResult");
const { sendResultsToComponent1 } = require("../services/blockchainService");

// =======================================
// DYNAMIC POLICY READER FOR BLOCKCHAIN JOB
// =======================================
const getPolicyConfig = () => {
  try {
    const configPath = path.join(__dirname, "../../../component-03-silent-bridge/middleware/system-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("⚠️ Could not read policy for blockchain job.");
  }
  return { timeUnit: "minutes", specialConcernsWindow: 5 };
};

// =======================================
// AUTOMATIC BLOCKCHAIN JOB
// =======================================

const startBlockchainJob = () => {
  // Run once when server starts[cite: 6]
  runBlockchainSync();

  // Run every minute for synchronized batch anchoring
  cron.schedule("* * * * *", async () => {
    await runBlockchainSync();
  });

  console.log("⛓️ Synchronized Blockchain Job Started.");
  console.log("   → Checking blockchain-eligible results every minute.");
};

// =======================================
// RUN BLOCKCHAIN SYNC
// =======================================

const runBlockchainSync = async () => {
  try {
    const policy = getPolicyConfig();
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
      return; // Keeps console clean when no items are pending
    }

    console.log(`\n🔗 [Blockchain Sync] Found ${eligibleResults.length} eligible result(s) ready for anchoring (Unit: ${policy.timeUnit}).`);

    for (const result of eligibleResults) {
      if (result.blockchainStatus === "PENDING") {
        result.blockchainStatus = "READY";
        await result.save();
      }
    }

    try {
      await sendResultsToComponent1(eligibleResults);

      for (const result of eligibleResults) {
        result.blockchainStatus = "STORED";
        result.blockchainStoredAt = new Date();
        await result.save();
      }

      console.log(`✅ Successfully anchored ${eligibleResults.length} result(s) to Component 1.`);
    } catch (error) {
      console.error("❌ Failed to send results to Component 1:", error.message);

      for (const result of eligibleResults) {
        result.blockchainStatus = "READY";
        await result.save();
      }

      console.log("🔄 Results remain READY and will be retried on next tick.");
    }
  } catch (error) {
    console.error("❌ Blockchain synchronization failed:", error);
  }
};

module.exports = {
  startBlockchainJob,
};