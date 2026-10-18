const SystemPolicy = require("../models/SystemPolicy");

const POLICY_ID = "time-gate";

const getEnvironmentPolicy = () => ({
  timeUnit: process.env.TIME_UNIT || "minutes",
  standardUploadWindow: Number(process.env.STANDARD_UPLOAD_WINDOW || 1),
  boeReviewWindow: Number(process.env.BOE_REVIEW_WINDOW || 2),
  specialConcernsWindow: Number(process.env.SPECIAL_CONCERNS_WINDOW || 3),
});

const validateSystemPolicy = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Policy must be a JSON object." };
  }

  const policy = {
    timeUnit: value.timeUnit,
    standardUploadWindow: Number(value.standardUploadWindow),
    boeReviewWindow: Number(value.boeReviewWindow),
    specialConcernsWindow: Number(value.specialConcernsWindow),
  };

  if (!["days", "minutes"].includes(policy.timeUnit)) {
    return { error: "Time unit must be either days or minutes." };
  }

  if (
    ![
      policy.standardUploadWindow,
      policy.boeReviewWindow,
      policy.specialConcernsWindow,
    ].every((window) => Number.isFinite(window) && window > 0)
  ) {
    return { error: "All policy windows must be positive numbers." };
  }

  if (
    !(
      policy.standardUploadWindow < policy.boeReviewWindow &&
      policy.boeReviewWindow < policy.specialConcernsWindow
    )
  ) {
    return {
      error:
        "Policy windows must increase from standard upload to BOE review to special concerns.",
    };
  }

  return { policy };
};

const getSystemPolicy = async () => {
  const storedPolicy = await SystemPolicy.findById(POLICY_ID).lean();
  if (storedPolicy) {
    const { timeUnit, standardUploadWindow, boeReviewWindow, specialConcernsWindow } =
      storedPolicy;
    return {
      timeUnit,
      standardUploadWindow,
      boeReviewWindow,
      specialConcernsWindow,
    };
  }

  return getEnvironmentPolicy();
};

const saveSystemPolicy = async (policy) =>
  SystemPolicy.findByIdAndUpdate(
    POLICY_ID,
    { $set: policy },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

module.exports = {
  getSystemPolicy,
  saveSystemPolicy,
  validateSystemPolicy,
};
