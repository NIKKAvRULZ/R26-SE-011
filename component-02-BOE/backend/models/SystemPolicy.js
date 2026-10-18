const mongoose = require("mongoose");

const systemPolicySchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    timeUnit: {
      type: String,
      enum: ["days", "minutes"],
      required: true,
    },
    standardUploadWindow: {
      type: Number,
      required: true,
      min: 0,
    },
    boeReviewWindow: {
      type: Number,
      required: true,
      min: 0,
    },
    specialConcernsWindow: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("SystemPolicy", systemPolicySchema);
