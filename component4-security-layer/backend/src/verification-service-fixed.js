const fs = require('fs/promises');
const path = require('path');
const snarkjs = require('snarkjs');
const {
  canonicalRecordString,
  canonicalizeIdentifier,
  gradeToGpa,
  getMerkleProof,
  normalizeMerkleRoot,
  sha256Hex,
  verifyMerkleProof,
} = require('./verification-utils');
const { listInstitutions, resolveInstitution } = require('./institutions');

function createVerificationService(options = {}) {
  const dataBaseUrl = options.dataBaseUrl || process.env.ACADEMIC_DATA_BASE_URL || 'http://localhost:3000/proof';
  const fetchImpl = options.fetchImpl || global.fetch;
  const sessionStore = options.sessionStore || new Map();
  const verifyProofImpl = options.verifyProofImpl || null;
  const loginVerificationKeyPaths = options.loginVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_vkey.json'),
    path.resolve(__dirname, '..', '..', 'build', 'verification_key.json'),
  ];
  const gradeVerificationKeyPaths = options.gradeVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'gradeVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'gradeVerifier_vkey.json'),
  ];

  async function readJsonIfExists(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  async function loadVerificationKey(candidatePaths) {
    for (const candidatePath of candidatePaths) {
      const key = await readJsonIfExists(candidatePath);
      if (key) {
        return key;
      }
    }

    return null;
  }

  async function verifyProof({ proof, publicSignals, keyPaths }) {
    if (verifyProofImpl) {
      return verifyProofImpl({ proof, publicSignals, keyPaths });
    }

    const verificationKey = await loadVerificationKey(keyPaths);

    if (!verificationKey) {
      return false;
    }

    return snarkjs.groth16.verify(verificationKey, publicSignals, proof);
  }

  async function fetchJson(url) {
    if (!fetchImpl) {
      throw new Error('Fetch is not available in this runtime');
    }

    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      const error = new Error(`Failed to fetch verification data: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function readVerificationSource() {
    const candidates = [
      path.resolve(__dirname, '..', '..', 'proof-output', 'public.json'),
      path.resolve(__dirname, '..', '..', 'proof-output', 'proof-summary.json'),
    ];

    for (const candidatePath of candidates) {
      const payload = await readJsonIfExists(candidatePath);
      if (payload?.verificationSource?.blockchain) {
        const blockchain = payload.verificationSource.blockchain;
        return {
          merkleRoot: normalizeMerkleRoot(blockchain.merkleRoot || payload.data?.merkleRoot),
          ipfsCID: blockchain.ipfsCID || payload.data?.ipfsCID || null,
          timestamp: blockchain.timestamp || payload.data?.generatedAt || null,
          uploadedBy: blockchain.uploadedBy || null,
        };
      }

      if (payload?.data?.merkleRoot) {
        return {
          merkleRoot: normalizeMerkleRoot(payload.data.merkleRoot),
          ipfsCID: payload.verificationSource?.blockchain?.ipfsCID || null,
          timestamp: payload.data?.generatedAt || null,
          uploadedBy: payload.verificationSource?.blockchain?.uploadedBy || null,
        };
      }
    }

    return {
      merkleRoot: normalizeMerkleRoot(process.env.ACADEMIC_MERKLE_ROOT || ''),
      ipfsCID: process.env.ACADEMIC_IPFS_CID || null,
      timestamp: null,
      uploadedBy: null,
    };
  }

  async function fetchFinalizedDataset(merkleRoot) {
    const normalizedRoot = normalizeMerkleRoot(merkleRoot);
    const dataset = await fetchJson(`${dataBaseUrl}/${normalizedRoot}/data`);
    return dataset;
  }

  async function getOfficialVerificationDataset() {
    const source = await readVerificationSource();

    if (!source.merkleRoot) {
      throw new Error('No anchored Merkle root is configured for verification');
    }

    const dataset = await fetchFinalizedDataset(source.merkleRoot);
    const blockchainRoot = normalizeMerkleRoot(dataset?.verificationSource?.blockchain?.merkleRoot || source.merkleRoot);
    const ipfsCID = dataset?.verificationSource?.blockchain?.ipfsCID || source.ipfsCID || null;
    const records = Array.isArray(dataset?.data?.recordsWithHashes) ? dataset.data.recordsWithHashes : [];
    const dataRoot = normalizeMerkleRoot(dataset?.data?.merkleRoot || source.merkleRoot);

    return {
      blockchainRoot,
      dataRoot,
      ipfsCID,
      dataset,
      records,
      source,
      totalRecords: dataset?.data?.totalRecords ?? records.length,
    };
  }

  async function getTranscript(candidateId) {
    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const verificationDataset = await getOfficialVerificationDataset();
    const candidateRecords = verificationDataset.records.filter(
      (record) => canonicalizeIdentifier(record.candidateId) === normalizedCandidateId,
    );

    if (candidateRecords.length === 0) {
      const error = new Error('Candidate not found');
      error.status = 404;
      throw error;
    }

    const transcriptEntries = candidateRecords.map((record, index) => ({
      ...record,
      gpa: gradeToGpa(record.grade),
      index,
    }));

    return {
      candidateId: normalizedCandidateId,
      verificationSource: {
        blockchain: {
          merkleRoot: verificationDataset.blockchainRoot,
          ipfsCID: verificationDataset.ipfsCID,
          timestamp: verificationDataset.source.timestamp,
          uploadedBy: verificationDataset.source.uploadedBy,
        },
      },
      data: {
        merkleRoot: verificationDataset.dataRoot,
        totalRecords: verificationDataset.totalRecords,
        generatedAt: verificationDataset.dataset?.data?.generatedAt || null,
        recordsWithHashes: transcriptEntries,
      },
      transcript: transcriptEntries,
      gpa: transcriptEntries.length
        ? transcriptEntries.reduce((sum, record) => sum + (record.gpa ?? 0), 0) / transcriptEntries.length
        : null,
    };
  }

  async function verifyLoginProof({ institutionId, proof, publicSignals, commitment }) {
    const institution = await resolveInstitution(institutionId);

    if (!institution) {
      return {
        success: false,
        status: 404,
        error: 'Unknown institution',
      };
    }

    const normalizedSignals = Array.isArray(publicSignals) ? publicSignals.map((value) => normalizeMerkleRoot(value)) : [];
    const normalizedCommitment = normalizeMerkleRoot(commitment || normalizedSignals[0] || '');

    if (normalizedCommitment !== institution.commitment) {
      return {
        success: false,
        status: 403,
        error: 'Institution commitment mismatch',
      };
    }

    const verified = await verifyProof({ proof, publicSignals, keyPaths: loginVerificationKeyPaths });

    if (!verified) {
      return {
        success: false,
        status: 403,
        error: 'ZKP authentication failed',
      };
    }

    const token = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session = {
      token,
      institutionId: institution.id,
      institutionName: institution.name,
      authenticated: true,
      authenticatedAt: new Date().toISOString(),
    };

    sessionStore.set(token, session);

    return {
      success: true,
      token,
      institution,
      session,
    };
  }

  function authenticateToken(token) {
    if (!token) {
      return null;
    }

    return sessionStore.get(token) || null;
  }

  function revokeToken(token) {
    if (token) {
      sessionStore.delete(token);
    }
  }

  async function verifyGradeRequest({ candidateId, moduleCode, claimedGrade, sessionToken, gradeProof, gradePublicSignals }) {
    const session = authenticateToken(sessionToken);

    if (!session) {
      return {
        success: false,
        status: 401,
        error: 'Unauthorized',
      };
    }

    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const normalizedModuleCode = canonicalizeIdentifier(moduleCode);
    const normalizedClaimedGrade = String(claimedGrade ?? '').trim().toUpperCase();

    if (!normalizedCandidateId || !normalizedModuleCode || !normalizedClaimedGrade) {
      return {
        success: false,
        status: 400,
        error: 'Missing required academic verification fields',
      };
    }

    const verificationDataset = await getOfficialVerificationDataset();
    const recordIndex = verificationDataset.records.findIndex(
      (record) =>
        canonicalizeIdentifier(record.candidateId) === normalizedCandidateId &&
        canonicalizeIdentifier(record.moduleCode) === normalizedModuleCode,
    );

    if (recordIndex < 0) {
      return {
        success: false,
        status: 404,
        error: 'Candidate or module not found',
      };
    }

    const record = verificationDataset.records[recordIndex];
    const officialHash = normalizeMerkleRoot(record.hash || '');
    const submittedHash = sha256Hex(canonicalRecordString({
      candidateId: normalizedCandidateId,
      moduleCode: normalizedModuleCode,
      grade: normalizedClaimedGrade,
    }));
    const hashValid = submittedHash === officialHash;

    const proof = getMerkleProof(verificationDataset.records.map((entry) => entry.hash), recordIndex);
    const merkleValid =
      hashValid &&
      verifyMerkleProof(record.hash, proof, verificationDataset.blockchainRoot) &&
      verificationDataset.blockchainRoot === verificationDataset.dataRoot;
    const blockchainAnchorValid = verificationDataset.blockchainRoot === verificationDataset.dataRoot;

    let zkpValid = false;
    if (gradeProof && gradePublicSignals) {
      zkpValid = await verifyProof({ proof: gradeProof, publicSignals: gradePublicSignals, keyPaths: gradeVerificationKeyPaths });
    } else {
      zkpValid = hashValid && merkleValid;
    }

    const valid = hashValid && merkleValid && blockchainAnchorValid && zkpValid;

    return {
      success: valid,
      status: 200,
      valid,
      result: valid ? 'VALID' : 'INVALID',
      tampered: !valid,
      verificationSource: {
        blockchain: {
          merkleRoot: verificationDataset.blockchainRoot,
          ipfsCID: verificationDataset.ipfsCID,
          timestamp: verificationDataset.source.timestamp,
          uploadedBy: verificationDataset.source.uploadedBy,
        },
      },
      record: {
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
        claimedGrade: normalizedClaimedGrade,
        officialGrade: record.grade,
        officialHash,
        submittedHash,
      },
      checks: {
        cryptographicHash: hashValid ? 'VALID' : 'INVALID',
        merkleProof: merkleValid ? 'VALID' : 'NOT VERIFIED',
        blockchainAnchor: blockchainAnchorValid ? 'VERIFIED' : 'MISMATCH',
        zkpVerification: zkpValid ? 'VALID' : 'FAILED',
      },
      transcriptRecord: {
        ...record,
        gpa: gradeToGpa(record.grade),
      },
    };
  }

  return {
    authenticateToken,
    fetchFinalizedDataset,
    getOfficialVerificationDataset,
    getTranscript,
    listInstitutions,
    readVerificationSource,
    revokeToken,
    verifyGradeRequest,
    verifyLoginProof,
  };
}

module.exports = {
  createVerificationService,
};"use strict";

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
};
