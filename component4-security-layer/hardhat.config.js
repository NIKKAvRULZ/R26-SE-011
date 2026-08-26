require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: require("node:path").resolve(__dirname, "backend", ".env") });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./build/hardhat-cache",
    artifacts: "./build/hardhat-artifacts",
  },
};
