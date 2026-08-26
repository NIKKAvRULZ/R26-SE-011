"use strict";

const fs = require("node:fs");
const snarkjs = require("snarkjs");
const { generateProof, gradeToNumeric, computeCommitment } = require("./proof-generator");
const { getInstitutionById, listInstitutions } = require("./institutions");
const { createSession } = require("./session-store");
const {
  FINALIZED_DATASET,
  calculateCgpa,
  getRecord,
  getTranscript,
  verifyClaimAgainstRecord,
} = require("./dataset-store");
const { loginArtifactsAvailable, getLoginArtifactPaths } = require("./login-artifacts");

const DEFAULT_LOGIN_TTL_SECONDS = Number(process.env.LOGIN_TTL_SECONDS || 60 * 30);

async function verifyLoginProof({ institutionId, proof, publicSignals }) {
  if (!loginArtifactsAvailable()) {
    return {
      ok: false,
      status: 503,
      error: "Login circuit artifacts are not available yet",
    };
  }

  const institution = await getInstitutionById(institutionId);
  if (!institution) {
    return {
      ok: false,
      status: 404,
      error: "Institution not found",
    };
  }

  if (!proof || !Array.isArray(publicSignals) || publicSignals.length < 1) {
    return {
      ok: false,
      status: 400,
      error: "Malformed authentication proof",
    };
  }

  if (publicSignals[0] !== institution.commitment) {
    return {
      ok: false,
      status: 401,
      error: "Authentication commitment mismatch",
    };
  }

  const { vkPath } = getLoginArtifactPaths();
  const verificationKey = JSON.parse(fs.readFileSync(vkPath, "utf8"));
  const isValid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);

  if (!isValid) {
    return {
      ok: false,
      status: 401,
      error: "Invalid ZKP credential",
    };
  }

  const session = createSession(institution, DEFAULT_LOGIN_TTL_SECONDS);
  return {
    ok: true,
    status: 200,
    institution,
    session,
  };
}

function normalizeGradeClaim(gradeValue) {
  const numericGrade = gradeToNumeric(gradeValue);
  if (numericGrade === undefined || numericGrade < 0 || numericGrade > 5) {
    return undefined;
  }

  return numericGrade;
}

async function verifyGradeVerification({ candidateId, moduleCode, claimedGrade }) {
  const record = getRecord(candidateId, moduleCode);

  if (!record) {
    return {
      ok: false,
      status: 404,
      error: "Candidate or module not found",
      result: {
        cryptographicProof: "INVALID",
        merkleProof: "NOT VERIFIED",
        blockchainAnchor: "NOT VERIFIED",
        zkpVerification: "NOT VERIFIED",
        overall: "INVALID / TAMPERED",
      },
    };
  }

  const claimChecks = verifyClaimAgainstRecord(record, candidateId, moduleCode, claimedGrade);
  const numericGrade = normalizeGradeClaim(claimedGrade);

  if (numericGrade === undefined) {
    return {
      ok: false,
      status: 400,
      error: "Invalid grade format",
      result: {
        cryptographicProof: "INVALID",
        merkleProof: claimChecks.merkleProofValid ? "VALID" : "INVALID",
        blockchainAnchor: claimChecks.anchorVerified ? "VERIFIED" : "NOT VERIFIED",
        zkpVerification: "NOT VERIFIED",
        overall: "INVALID / TAMPERED",
      },
    };
  }

  const { proof, publicSignals } = await generateProof({ gradeValue: numericGrade });
  const expectedCommitment = await computeCommitment(numericGrade);
  const zkpValid = publicSignals[0] === expectedCommitment;

  const result = {
    candidateId: record.candidateId,
    moduleCode: record.moduleCode,
    cryptographicProof: claimChecks.hashMatch ? "VALID" : "INVALID",
    merkleProof: claimChecks.merkleProofValid ? "VALID" : "INVALID",
    blockchainAnchor: claimChecks.anchorVerified ? "VERIFIED" : "NOT VERIFIED",
    zkpVerification: zkpValid ? "VALID" : "INVALID",
    overall:
      claimChecks.hashMatch && claimChecks.merkleProofValid && claimChecks.anchorVerified && zkpValid
        ? "AUTHENTIC"
        : "INVALID / TAMPERED",
    datasetCid: FINALIZED_DATASET.cid,
    merkleRoot: FINALIZED_DATASET.merkleRoot,
    proof,
    publicSignals,
  };

  return {
    ok: result.overall === "AUTHENTIC",
    status: result.overall === "AUTHENTIC" ? 200 : 422,
    result,
  };
}

function buildTranscriptResponse(candidateId) {
  const transcript = getTranscript(candidateId);

  if (!transcript.length) {
    return {
      ok: false,
      status: 404,
      error: "Candidate not found",
    };
  }

  return {
    ok: true,
    status: 200,
    candidateId: transcript[0].candidateId,
    candidateName: transcript[0].candidateName,
    university: transcript[0].university,
    datasetCid: FINALIZED_DATASET.cid,
    merkleRoot: FINALIZED_DATASET.merkleRoot,
    blockchainAnchor: FINALIZED_DATASET.blockchainMerkleRoot,
    transcript: transcript.map((record) => ({
      moduleCode: record.moduleCode,
      credits: record.credits,
      grade: record.grade,
      semester: record.semester,
      academicYear: record.academicYear,
      status: "VERIFIED",
    })),
    cgpa: calculateCgpa(transcript),
  };
}

module.exports = {
  buildTranscriptResponse,
  listInstitutions,
  verifyGradeVerification,
  verifyLoginProof,
};"use strict";

const fs = require("fs");
const snarkjs = require("snarkjs");
const { generateProof, gradeToNumeric, computeCommitment } = require("./proof-generator");
const { getInstitutionById, listInstitutions } = require("./institutions");
const { createSession } = require("./session-store");
const {
  FINALIZED_DATASET,
  calculateCgpa,
  getRecord,
  getTranscript,
  verifyClaimAgainstRecord,
} = require("./dataset-store");
const { loginArtifactsAvailable, getLoginArtifactPaths } = require("./login-artifacts");

const DEFAULT_LOGIN_TTL_SECONDS = Number(process.env.LOGIN_TTL_SECONDS || 60 * 30);

async function verifyLoginProof({ institutionId, proof, publicSignals }) {
  if (!loginArtifactsAvailable()) {
    return {
      ok: false,
      status: 503,
      error: "Login circuit artifacts are not available yet",
    };
  }

  const institution = await getInstitutionById(institutionId);
  if (!institution) {
    return {
      ok: false,
      status: 404,
      error: "Institution not found",
    };
  }

  if (!proof || !Array.isArray(publicSignals) || publicSignals.length < 1) {
    return {
      ok: false,
      status: 400,
      error: "Malformed authentication proof",
    };
  }

  if (publicSignals[0] !== institution.commitment) {
    return {
      ok: false,
      status: 401,
      error: "Authentication commitment mismatch",
    };
  }

  const { vkPath } = getLoginArtifactPaths();
  const verificationKey = JSON.parse(fs.readFileSync(vkPath, "utf8"));
  const isValid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);

  if (!isValid) {
    return {
      ok: false,
      status: 401,
      error: "Invalid ZKP credential",
    };
  }

  const session = createSession(institution, DEFAULT_LOGIN_TTL_SECONDS);
  return {
    ok: true,
    status: 200,
    institution,
    session,
  };
}

function normalizeGradeClaim(gradeValue) {
  const numericGrade = gradeToNumeric(gradeValue);
  if (numericGrade === undefined || numericGrade < 0 || numericGrade > 5) {
    return undefined;
  }

  return numericGrade;
}

async function verifyGradeVerification({ candidateId, moduleCode, claimedGrade }) {
  const record = getRecord(candidateId, moduleCode);

  if (!record) {
    return {
      ok: false,
      status: 404,
      error: "Candidate or module not found",
      result: {
        cryptographicProof: "INVALID",
        merkleProof: "NOT VERIFIED",
        blockchainAnchor: "NOT VERIFIED",
        zkpVerification: "NOT VERIFIED",
        overall: "INVALID / TAMPERED",
      },
    };
  }

  const claimChecks = verifyClaimAgainstRecord(record, candidateId, moduleCode, claimedGrade);
  const numericGrade = normalizeGradeClaim(claimedGrade);

  if (numericGrade === undefined) {
    return {
      ok: false,
      status: 400,
      error: "Invalid grade format",
      result: {
        cryptographicProof: "INVALID",
        merkleProof: claimChecks.merkleProofValid ? "VALID" : "INVALID",
        blockchainAnchor: claimChecks.anchorVerified ? "VERIFIED" : "NOT VERIFIED",
        zkpVerification: "NOT VERIFIED",
        overall: "INVALID / TAMPERED",
      },
    };
  }

  const { proof, publicSignals } = await generateProof({ gradeValue: numericGrade });
  const expectedCommitment = await computeCommitment(numericGrade);
  const zkpValid = publicSignals[0] === expectedCommitment;

  const result = {
    candidateId: record.candidateId,
    moduleCode: record.moduleCode,
    cryptographicProof: claimChecks.hashMatch ? "VALID" : "INVALID",
    merkleProof: claimChecks.merkleProofValid ? "VALID" : "INVALID",
    blockchainAnchor: claimChecks.anchorVerified ? "VERIFIED" : "NOT VERIFIED",
    zkpVerification: zkpValid ? "VALID" : "INVALID",
    overall:
      claimChecks.hashMatch && claimChecks.merkleProofValid && claimChecks.anchorVerified && zkpValid
        ? "AUTHENTIC"
        : "INVALID / TAMPERED",
    datasetCid: FINALIZED_DATASET.cid,
    merkleRoot: FINALIZED_DATASET.merkleRoot,
    proof,
    publicSignals,
  };

  return {
    ok: result.overall === "AUTHENTIC",
    status: result.overall === "AUTHENTIC" ? 200 : 422,
    result,
  };
}

function buildTranscriptResponse(candidateId) {
  const transcript = getTranscript(candidateId);

  if (!transcript.length) {
    return {
      ok: false,
      status: 404,
      error: "Candidate not found",
    };
  }

  return {
    ok: true,
    status: 200,
    candidateId: transcript[0].candidateId,
    candidateName: transcript[0].candidateName,
    university: transcript[0].university,
    datasetCid: FINALIZED_DATASET.cid,
    merkleRoot: FINALIZED_DATASET.merkleRoot,
    blockchainAnchor: FINALIZED_DATASET.blockchainMerkleRoot,
    transcript: transcript.map((record) => ({
      moduleCode: record.moduleCode,
      credits: record.credits,
      grade: record.grade,
      semester: record.semester,
      academicYear: record.academicYear,
      status: "VERIFIED",
    })),
    cgpa: calculateCgpa(transcript),
  };
}

module.exports = {
  buildTranscriptResponse,
  listInstitutions,
  verifyGradeVerification,
  verifyLoginProof,
};"use strict";

const fs = require("node:fs");
const path = require("node:path");
const snarkjs = require("snarkjs");
const { generateProof } = require("./proof-generator");
const {
  canonicalizeGradeClaim,
  sha256Hex,
  verifyMerkleProof,
} = require("./crypto-utils");
const { findRecord, getTranscript } = require("./reference-data");

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const GRADE_VK_PATH = path.join(BUILD_DIR, "verification_key.json");

const GRADE_POINTS = {
  "A+": 4,
  A: 4,
  "A-": 3.7,
  "B+": 3.3,
  B: 3,
  "B-": 2.7,
  "C+": 2.3,
  C: 2,
  "C-": 1.7,
  "D+": 1.3,
  D: 1,
  E: 0,
};

const LETTER_TO_GRADE_VALUE = {
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  "A+": 5,
};

function normalizeGrade(value) {
  return String(value ?? "").trim().toUpperCase();
}

function computeCgpa(records) {
  let totalQualityPoints = 0;
  let totalCredits = 0;

  for (const record of records) {
    const grade = normalizeGrade(record.grade);
    const credits = Number(record.credits) || 0;

    if (GRADE_POINTS[grade] !== undefined && credits > 0) {
      totalQualityPoints += GRADE_POINTS[grade] * credits;
      totalCredits += credits;
    }
  }

  return totalCredits > 0 ? (totalQualityPoints / totalCredits).toFixed(2) : "0.00";
}

function loadGradeVerificationKey() {
  if (!fs.existsSync(GRADE_VK_PATH)) {
    throw new Error("Grade verification key not found. Run npm run setup first.");
  }

  return JSON.parse(fs.readFileSync(GRADE_VK_PATH, "utf8"));
}

async function verifyClaimedGradeProof(claimedGrade) {
  const gradeValue = LETTER_TO_GRADE_VALUE[normalizeGrade(claimedGrade)];
  if (gradeValue === undefined) {
    return {
      ok: false,
      error: "Invalid grade format",
    };
  }

  const { proof, publicSignals, gradeHash } = await generateProof({ gradeValue });
  const verificationKey = loadGradeVerificationKey();
  const valid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);

  return {
    ok: valid,
    gradeValue,
    gradeHash,
    proof,
    publicSignals,
  };
}

function verifyGradeClaim({ candidateId, moduleCode, claimedGrade }) {
  const { record, ledger } = findRecord(candidateId, moduleCode);

  if (!record) {
    return {
      ok: false,
      status: 404,
      error: "Candidate or module not found",
      ledger,
    };
  }

  const canonicalClaim = canonicalizeGradeClaim({
    candidateId,
    moduleCode,
    grade: claimedGrade,
  });
  const claimedHash = sha256Hex(canonicalClaim);
  const cryptographicProofValid = claimedHash === record.claimHash;
  const merkleProofValid = verifyMerkleProof(record.claimHash, record.merkleProof, ledger.computedMerkleRoot);
  const blockchainAnchorVerified = ledger.anchoredMerkleRoot === ledger.computedMerkleRoot;

  return {
    ok: cryptographicProofValid && merkleProofValid && blockchainAnchorVerified,
    candidateId: record.candidateId,
    moduleCode: record.moduleCode,
    claimedGrade: normalizeGrade(claimedGrade),
    record,
    ledger,
    canonicalClaim,
    claimedHash,
    cryptographicProofValid,
    merkleProofValid,
    blockchainAnchorVerified,
  };
}

function getVerifiedTranscript(candidateId) {
  const transcript = getTranscript(candidateId);

  return {
    ...transcript,
    cgpa: computeCgpa(transcript.records),
  };
}

module.exports = {
  computeCgpa,
  getVerifiedTranscript,
  verifyClaimedGradeProof,
  verifyGradeClaim,
};