const express = require("express");
const cors = require("cors");

const app = express();

const PORT = 6000;

app.use(cors());
app.use(express.json());

app.post("/blockchain/storeHash", (req, res) => {
  console.log("\n=======================================");
  console.log("🔗 COMPONENT 1 RECEIVED HASH");
  console.log("=======================================");

  console.dir(req.body, {
    depth: null,
    colors: true,
  });

  console.log("=======================================\n");

  const { candidateId, hash } = req.body;

  if (!candidateId || !hash) {
    return res.status(400).json({
      success: false,
      message: "candidateId and hash are required.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Hash successfully received by Component 1.",
    candidateId,
    hash,
  });
});

app.listen(PORT, () => {
  console.log(
    `🔗 Mock Component 1 running on http://localhost:${PORT}`,
  );

  console.log(
    `   Endpoint: POST http://localhost:${PORT}/blockchain/storeHash`,
  );
});