const Result = require("../models/Result");

const BOE_REVIEW_DAYS = Number(process.env.BOE_REVIEW_DAYS || 7);

// GET MODULE REVIEW STATUS
const getModuleReviewStatus = async (moduleCode) => {
  const normalizedModuleCode = moduleCode.trim().toUpperCase();

  const results = await Result.find({
    moduleCode: normalizedModuleCode,
    isRecorrection: false,
  })
    .select("releaseDate finalized")
    .lean();

  // No results for this module
  if (results.length === 0) {
    return {
      moduleCode: normalizedModuleCode,
      status: "EMPTY",
      releaseDate: null,
      reviewDeadline: null,
    };
  }

  // =======================================
  // DETERMINE MODULE RELEASE DATE
  // =======================================

  // Use the earliest release date as the module review window start.
  const releaseDate = results.reduce((earliest, result) => {
    const current = new Date(result.releaseDate);

    if (!earliest || current < earliest) {
      return current;
    }

    return earliest;
  }, null);

  // CALCULATE REVIEW DEADLINE
  const reviewDeadline = new Date(
    releaseDate.getTime() + BOE_REVIEW_DAYS * 24 * 60 * 60 * 1000,
  );

  // CHECK WHETHER MODULE IS LOCKED
  const now = new Date();
  const allFinalized = results.every((result) => result.finalized === true);
  const deadlinePassed = now >= reviewDeadline;
  const isLocked = allFinalized || deadlinePassed;

  return {
    moduleCode: normalizedModuleCode,
    status: isLocked ? "LOCKED" : "OPEN",
    releaseDate,
    reviewDeadline,
    finalized: allFinalized,
  };
};

// CHECK MODULE ACCESS
const checkModuleAccess = async (moduleCode) => {
  const status = await getModuleReviewStatus(moduleCode);

  if (status.status === "LOCKED") {
    return {
      allowed: false,
      status,
    };
  }

  if (status.status === "EMPTY") {
    return {
      allowed: false,
      status,
    };
  }

  return {
    allowed: true,
    status,
  };
};

module.exports = {
  getModuleReviewStatus,
  checkModuleAccess,
};