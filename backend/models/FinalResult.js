const mongoose = require("mongoose");

// HISTORY SCHEMA
const historySchema = new mongoose.Schema({
  version: {
    type: Number,
  },

  oldMarks: {
    type: Number,
  },

  newMarks: {
    type: Number,
  },

  oldGrade: {
    type: String,
  },

  newGrade: {
    type: String,
  },

  editedBy: {
    type: String,
  },

  reason: {
    type: String,
  },

  editedAt: {
    type: Date,
    default: Date.now,
  },
});

// FINAL RESULT SCHEMA
const finalResultSchema = new mongoose.Schema(
  {
    candidateId: {
      type: String,
      required: true,
    },

    moduleCode: {
      type: String,
      required: true,
    },

    marks: {
      type: Number,
      required: true,
    },

    grade: {
      type: String,
      required: true,
    },

    gradingData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    uploader: {
      type: String,
    },

    provenanceHash: {
      type: String,
    },

    payloadHash: {
      type: String,
    },

    // VERSION
    version: {
      type: Number,
      default: 1,
    },

    // AUDIT HISTORY
    history: [historySchema],

    // FINALIZATION
    finalizedAt: {
      type: Date,
      required: true,
    },

    // When the final result becomes eligible to be sent to Component 1.
    blockchainEligibleAt: {
      type: Date,
      required: true,
    },

    // STUDENT HASH
    hash: {
      type: String,
      required: true,
    },

    // BLOCKCHAIN STATUS
    blockchainStatus: {
      type: String,
      enum: ["PENDING", "READY", "SENT", "STORED"],
      default: "PENDING",
    },

    blockchainStoredAt: {
      type: Date,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// UNIQUE STUDENT + MODULE
finalResultSchema.index(
  {
    candidateId: 1,
    moduleCode: 1,
  },
  {
    unique: true,
  },
);

module.exports = mongoose.model("FinalResult", finalResultSchema);