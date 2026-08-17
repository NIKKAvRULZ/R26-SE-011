const axios = require("axios");

const COMPONENT_1_URL = process.env.COMPONENT_1_URL;

// =======================================
// SEND HASH TO COMPONENT 1
// =======================================

const sendHashToComponent1 = async ({ candidateId, hash }) => {
  if (!COMPONENT_1_URL) {
    throw new Error("COMPONENT_1_URL is not configured.");
  }

  if (!candidateId || !hash) {
    throw new Error("candidateId and hash are required.");
  }

  const endpoint = `${COMPONENT_1_URL}/blockchain/storeHash`;

  console.log("\n=======================================");
  console.log("🔗 SENDING HASH TO COMPONENT 1");
  console.log("=======================================");
  console.log("Candidate ID:", candidateId);
  console.log("Hash:", hash);
  console.log("Endpoint:", endpoint);
  console.log("=======================================\n");

  const response = await axios.post(
    endpoint,
    {
      candidateId,
      hash,
    },
    {
      timeout: 5000,
    },
  );

  console.log("✅ Component 1 accepted hash.");
  console.log("Response:", response.data);

  return response.data;
};

module.exports = {
  sendHashToComponent1,
};
