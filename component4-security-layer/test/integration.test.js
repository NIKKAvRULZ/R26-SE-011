"use strict";

/**
 * integration.test.js
 * End-to-end integration tests: proof generation → on-chain verification.
 *
 * Prerequisites:
 *   1. Local Hardhat/Anvil node running at RPC_URL.
 *   2. GradeVerifier contract deployed and CONTRACT_ADDRESS set in .env.
 *   3. Circuit compiled and artifacts present in build/circuits/.
 */

const { expect } = require("chai");
const { ethers } = require("ethers");
const request = require("supertest");
const crypto = require("node:crypto");
const path = require("node:path");
const app = require("../backend/src/api-server");
const { getInstitutionById } = require("../backend/src/institutions");
const { getLoginArtifactPaths } = require("../backend/src/login-artifacts");
const { buildMerkleTree, canonicalizeGradeClaim, sha256Hex } = require("../backend/src/crypto-utils-fixed");
require("dotenv").config({ path: require("path").resolve(__dirname, "../backend/.env") });

const GRADE_VERIFIER_ABI = [
  "function verifyProof(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[1] input) view returns (bool)",
];

describe("Integration — API ↔ On-chain Verifier", function () {
  this.timeout(180_000);

  let provider;
  let contract;

  async function createValidLoginProof() {
    const institution = await getInstitutionById("EMP001");
    const { wasmPath, zkeyPath } = getLoginArtifactPaths();
    const secret = process.env.DEMO_INSTITUTION_SECRET || "demo-institution-zkp-secret";
    const digest = crypto.createHash("sha256").update(String(secret).trim(), "utf8").digest("hex");
    const fieldValue = BigInt(`0x${digest}`) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

    const { proof, publicSignals } = await require("snarkjs").groth16.fullProve(
      {
        institutionSecretField: fieldValue.toString(),
        institutionCommitment: institution.commitment,
      },
      wasmPath,
      zkeyPath
    );

    return { institution, proof, publicSignals };
  }

  before(async function () {
    if (!process.env.RPC_URL || !process.env.CONTRACT_ADDRESS) {
      this.skip(); // skip when env not configured
    }
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    // Skip gracefully when no local node is reachable
    try {
      await provider.getNetwork();
    } catch (_) {
      this.skip(); // skip when node not available
    }
    contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      GRADE_VERIFIER_ABI,
      provider
    );
  });

  it("GET /api/health returns 200", async function () {
    const res = await request(app).get("/api/health");
    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("ok");
  });

  it("POST /api/proof/generate returns proof and calldata", async function () {
    const res = await request(app)
      .post("/api/proof/generate")
      .send({ gradeValue: 3 }); // B = 3

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("proof");
    expect(res.body).to.have.property("gradeHash");
    expect(res.body).to.have.property("calldata");
  });

  it("Generated proof passes on-chain verifyProof", async function () {
    const genRes = await request(app)
      .post("/api/proof/generate")
      .send({ gradeValue: 4 }); // A = 4

    expect(genRes.status).to.equal(200);

    const { proof, publicSignals } = genRes.body;

    // Convert snarkjs proof to the struct expected by the contract
    const solidityProof = {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
    };

    // Circuit has 1 public signal: gradeHash
    const input = [publicSignals[0]];
    const isValid = await contract.verifyProof(solidityProof, input);
    expect(isValid).to.be.true;
  });

  it("POST /api/proof/verify returns { valid: true } for a valid proof", async function () {
    const genRes = await request(app)
      .post("/api/proof/generate")
      .send({ gradeValue: 2 }); // C = 2

    const { proof, publicSignals } = genRes.body;
    const solidityProof = {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
    };

    const verifyRes = await request(app)
      .post("/api/proof/verify")
      .send({ proof: solidityProof, input: publicSignals }); // publicSignals = [gradeHash]

    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.body.valid).to.be.true;
  });

  it("POST /api/auth/zkp accepts a valid login proof and creates a session", async function () {
    const { institution, proof, publicSignals } = await createValidLoginProof();

    const res = await request(app)
      .post("/api/auth/zkp")
      .send({ institutionId: institution.institutionId, proof, publicSignals });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("token");
    expect(res.body.institution.institutionId).to.equal("EMP001");
  });

  it("POST /api/verify/grade authenticates a valid academic record and returns AUTHENTIC", async function () {
    const { proof, publicSignals } = await createValidLoginProof();
    const authRes = await request(app)
      .post("/api/auth/zkp")
      .send({ institutionId: "EMP001", proof, publicSignals });

    const token = authRes.body.token;
    const res = await request(app)
      .post("/api/verify/grade")
      .set("Authorization", `Bearer ${token}`)
      .send({ candidateId: "IT22276346", moduleCode: "SE3030", claimedGrade: "A" });

    expect(res.status).to.equal(200);
    expect(res.body.overall).to.equal("AUTHENTIC");
  });

  it("GET /api/verify/transcript/:candidateId requires an authenticated session", async function () {
    const res = await request(app).get("/api/verify/transcript/IT22276346");
    expect(res.status).to.equal(401);
  });

  it("GET /proof/:merkleRoot/data returns the finalized dataset for the canonicalized root", async function () {
    const root = "0xe89fa682751c95ed0c5af23a08ed5853577be25954372cefb0bad48a68a0ea2b";
    const res = await request(app).get(`/proof/${root}/data`);

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.data).to.have.property("recordsWithHashes");
    expect(res.body.data).to.have.property("merkleRoot");
  });

  it("validates the canonical hash and Merkle membership shape used by the record", async function () {
    const candidateId = "IT22276346";
    const moduleCode = "SE3030";
    const claimedGrade = "A";
    const payload = [candidateId, moduleCode, claimedGrade].join("|");
    const computedHash = sha256Hex(canonicalizeGradeClaim(candidateId, moduleCode, claimedGrade));

    const built = buildMerkleTree([computedHash]);
    expect(built.root).to.be.a("string");
    expect(computedHash).to.be.a("string");
    expect(payload).to.contain("IT22276346");
  });
});
