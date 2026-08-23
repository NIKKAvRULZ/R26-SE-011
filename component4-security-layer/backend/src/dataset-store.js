"use strict";

const moduleConfig = require("../../middleware/module-config.json");
const {
  GRADE_POINTS,
  canonicalizeGradeClaim,
  buildMerkleTree,
  gradeToNumeric,
  normalizeIdentifier,
  sha256Hex,
  verifyMerkleProof,
} = require("./crypto-utils-fixed");
const { buildMerkleTree: buildVerificationMerkleTree } = require("./verification-utils");

const DATASET_CID = process.env.FINALIZED_DATASET_CID || "QmWud5Mb4rZ89vnZjkaMPfqodppRLu98E1S2m1H9NUTrbg";
const BLOCKCHAIN_MERKLE_ROOT_RAW = process.env.BLOCKCHAIN_MERKLE_ROOT || "";

const IPFS_RECORDS_WITH_HASHES = [
  {
    candidateId: "IT001",
    moduleCode: "SE3050",
    marks: 85,
    grade: "A",
    version: 2,
    hash: sha256Hex(canonicalizeGradeClaim("IT001", "SE3050", "A")),
  },
  {
    candidateId: "IT002",
    moduleCode: "SE3050",
    marks: 72,
    grade: "B",
    version: 1,
    hash: sha256Hex(canonicalizeGradeClaim("IT002", "SE3050", "B")),
  },
  {
    candidateId: "IT003",
    moduleCode: "SE3050",
    marks: 91,
    grade: "A+",
    version: 3,
    hash: sha256Hex(canonicalizeGradeClaim("IT003", "SE3050", "A+")),
  },
];

const COMPUTED_DATASET_MERKLE_ROOT = normalizeMerkleRoot(
  buildVerificationMerkleTree(IPFS_RECORDS_WITH_HASHES.map((record) => record.hash)).root,
);
const BLOCKCHAIN_MERKLE_ROOT = normalizeMerkleRoot(BLOCKCHAIN_MERKLE_ROOT_RAW || COMPUTED_DATASET_MERKLE_ROOT);

const IPFS_DATASET_PAYLOAD = {
  success: true,
  verificationSource: {
    blockchain: {
      merkleRoot: BLOCKCHAIN_MERKLE_ROOT,
      ipfsCID: DATASET_CID,
      timestamp: "1786976989",
      uploadedBy: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    },
  },
  data: {
    recordsWithHashes: IPFS_RECORDS_WITH_HASHES,
    merkleRoot: BLOCKCHAIN_MERKLE_ROOT,
    totalRecords: IPFS_RECORDS_WITH_HASHES.length,
    generatedAt: new Date().toISOString(),
  },
};

const RAW_RECORDS = [
  {
    candidateId: "IT22276346",
    candidateName: "Susara Perera",
    moduleCode: "SE3030",
    grade: "A",
    semester: "Semester 1",
    academicYear: "2025/2026",
    university: "SLIIT",
  },
  {
    candidateId: "IT22276346",
    candidateName: "Susara Perera",
    moduleCode: "SE4010",
    grade: "A-",
    semester: "Semester 1",
    academicYear: "2025/2026",
    university: "SLIIT",
  },
  {
    candidateId: "IT22276346",
    candidateName: "Susara Perera",
    moduleCode: "SE4020",
    grade: "B+",
    semester: "Semester 1",
    academicYear: "2025/2026",
    university: "SLIIT",
  },
  {
    candidateId: "IT22011223",
    candidateName: "N. Example",
    moduleCode: "SE3030",
    grade: "B",
    semester: "Semester 1",
    academicYear: "2025/2026",
    university: "SLIIT",
  },
];

function enrichRecord(record) {
  const claimHash = sha256Hex(
    canonicalizeGradeClaim(record.candidateId, record.moduleCode, record.grade)
  );

  const credits = Number(moduleConfig[record.moduleCode] || 0);
  return {
    ...record,
    candidateId: normalizeIdentifier(record.candidateId),
    moduleCode: normalizeIdentifier(record.moduleCode),
    claimHash,
    credits,
    numericGrade: gradeToNumeric(record.grade),
  };
}

const ENRICHED_RECORDS = RAW_RECORDS.map(enrichRecord);
const MERKLE = buildMerkleTree(ENRICHED_RECORDS.map((record) => record.claimHash));

function normalizeMerkleRoot(rootValue) {
  return String(rootValue ?? "").trim().toLowerCase().replace(/^0x/, "");
}

function getDatasetByMerkleRoot(merkleRoot) {
  const requestedRoot = normalizeMerkleRoot(merkleRoot);
  const canonicalRoot = normalizeMerkleRoot(BLOCKCHAIN_MERKLE_ROOT || FINALIZED_DATASET.merkleRoot || IPFS_DATASET_PAYLOAD.data.merkleRoot);

  if (!requestedRoot || requestedRoot !== canonicalRoot) {
    return null;
  }

  return {
    ...IPFS_DATASET_PAYLOAD,
    data: {
      ...IPFS_DATASET_PAYLOAD.data,
      merkleRoot: canonicalRoot,
    },
  };
}

const FINALIZED_DATASET = {
  cid: DATASET_CID,
  merkleRoot: MERKLE.root,
  blockchainMerkleRoot: BLOCKCHAIN_MERKLE_ROOT || MERKLE.root,
  records: ENRICHED_RECORDS.map((record, index) => ({
    ...record,
    merkleProof: MERKLE.proofs[index],
  })),
};

function getRecord(candidateId, moduleCode) {
  const normalizedCandidateId = normalizeIdentifier(candidateId);
  const normalizedModuleCode = normalizeIdentifier(moduleCode);

  return FINALIZED_DATASET.records.find(
    (record) =>
      record.candidateId === normalizedCandidateId &&
      record.moduleCode === normalizedModuleCode
  ) || null;
}

function getTranscript(candidateId) {
  const normalizedCandidateId = normalizeIdentifier(candidateId);
  return FINALIZED_DATASET.records.filter(
    (record) => record.candidateId === normalizedCandidateId
  );
}

function calculateCgpa(records) {
  let totalQualityPoints = 0;
  let totalCredits = 0;

  for (const record of records) {
    const gradePoints = GRADE_POINTS[record.grade.toUpperCase()];
    const credits = Number(moduleConfig[record.moduleCode] || record.credits || 0);

    if (gradePoints !== undefined && credits > 0) {
      totalQualityPoints += gradePoints * credits;
      totalCredits += credits;
    }
  }

  return totalCredits > 0 ? Number((totalQualityPoints / totalCredits).toFixed(2)) : 0;
}

function verifyDatasetAnchor() {
  return FINALIZED_DATASET.blockchainMerkleRoot === FINALIZED_DATASET.merkleRoot;
}

function verifyClaimAgainstRecord(record, candidateId, moduleCode, claimedGrade) {
  const canonicalClaimHash = sha256Hex(
    canonicalizeGradeClaim(candidateId, moduleCode, claimedGrade)
  );
  const merkleProofValid = verifyMerkleProof(
    record.claimHash,
    record.merkleProof,
    FINALIZED_DATASET.merkleRoot
  );

  return {
    canonicalClaimHash,
    hashMatch: canonicalClaimHash === record.claimHash,
    merkleProofValid,
    anchorVerified: verifyDatasetAnchor(),
  };
}

module.exports = {
  FINALIZED_DATASET,
  IPFS_DATASET_PAYLOAD,
  calculateCgpa,
  getDatasetByMerkleRoot,
  getRecord,
  getTranscript,
  normalizeMerkleRoot,
  verifyClaimAgainstRecord,
};