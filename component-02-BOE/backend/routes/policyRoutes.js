const express = require("express");
const {
  getSystemPolicy,
  saveSystemPolicy,
  validateSystemPolicy,
} = require("../services/systemPolicyService");

const router = express.Router();

router.get("/policy", async (req, res) => {
  try {
    res.json(await getSystemPolicy());
  } catch (error) {
    console.error("Failed to load system policy:", error);
    res.status(500).json({ message: "Failed to load system policy." });
  }
});

router.put("/policy", async (req, res) => {
  const validation = validateSystemPolicy(req.body);
  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  try {
    const policy = await saveSystemPolicy(validation.policy);
    res.status(200).json({
      success: true,
      policy: {
        timeUnit: policy.timeUnit,
        standardUploadWindow: policy.standardUploadWindow,
        boeReviewWindow: policy.boeReviewWindow,
        specialConcernsWindow: policy.specialConcernsWindow,
      },
    });
  } catch (error) {
    console.error("Failed to save system policy:", error);
    res.status(500).json({ message: "Failed to save system policy." });
  }
});

module.exports = router;
