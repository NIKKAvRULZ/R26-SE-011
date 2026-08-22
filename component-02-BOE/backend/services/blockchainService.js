const axios = require("axios");

const COMPONENT_1_URL = process.env.COMPONENT_1_URL;

// =======================================
// SEND FINAL RESULTS TO COMPONENT 1
// =======================================

const sendResultsToComponent1 = async (records) => {
  if (!COMPONENT_1_URL) {
    throw new Error("COMPONENT_1_URL is not configured.");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("At least one result record is required.");
  }

  const endpoint = `${COMPONENT_1_URL}/blockchain/storeHash`;

  // =======================================
  // PREPARE PAYLOAD
  // =======================================

  const payload = {
    records: records.map((result) => ({
      candidateId: result.candidateId,
      moduleCode: result.moduleCode,
      marks: result.marks,
      grade: result.grade,
      version: result.version,
      hash: result.hash,
    })),
  };

  console.log("\n=======================================");
  console.log("🔗 SENDING FINAL RESULTS TO COMPONENT 1");
  console.log("=======================================");
  console.log("Endpoint:", endpoint);
  console.log("Records:", JSON.stringify(payload, null, 2));
  console.log("=======================================\n");

  // =======================================
  // SEND REQUEST
  // =======================================

  const response = await axios.post(endpoint, payload, {
    timeout: 5000,
  });

  console.log("✅ Component 1 accepted final results.");
  console.log("Response:", response.data);

  return response.data;
};

module.exports = {
  sendResultsToComponent1,
};