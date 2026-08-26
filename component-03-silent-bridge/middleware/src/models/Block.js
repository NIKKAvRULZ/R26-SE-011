// middleware/src/models/Block.js
const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema({
  index: { type: Number, required: true },
  timestamp: { type: String, required: true },
  moduleCode: { type: String, required: true, uppercase: true },
  uploader: { type: String, required: true },
  isRecorrection: { type: Boolean, default: false },
  recordCount: { type: Number, required: true },
  payloadHash: { type: String, required: true },
  data: { type: Array, required: true },          
  previousHash: { type: String, required: true },
  blockHash: { type: String, required: true, unique: true },
  handedOffToBOE: { type: Boolean, default: false }
});

// 🔒 IMMUTABILITY ENFORCEMENT (BLOCKCHAIN RULES)
blockSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function() {
  const update = this.getUpdate();
  const modifiedFields = update.$set ? Object.keys(update.$set) : Object.keys(update);
  
  const alteringCoreData = modifiedFields.some(field => field !== 'handedOffToBOE');
  
  if (alteringCoreData) {
    throw new Error("SECURITY ALERT: Private ledger is append-only. Historical block modification is strictly prohibited.");
  }
});

blockSchema.pre(['deleteOne', 'findOneAndDelete', 'deleteMany'], function() {
  throw new Error("SECURITY ALERT: Ledger blocks are immutable. Deletion is strictly prohibited.");
});

const Block = mongoose.model("Block", blockSchema);
module.exports = Block;