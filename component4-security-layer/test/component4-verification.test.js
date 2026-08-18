const test = require('node:test');
const assert = require('node:assert/strict');

const { createVerificationService } = require('../backend/src/verification-service-fixed');
const {
  buildMerkleTree,
  canonicalRecordString,
  normalizeMerkleRoot,
  sha256Hex,
  verifyMerkleProof,
  getMerkleProof,
} = require('../backend/src/verification-utils');
const { resolveInstitution } = require('../backend/src/institutions');

async function createDataset() {
  const records = [
    {
      candidateId: 'IT001',
      moduleCode: 'SE3050',
      grade: 'A',
    },
    {
      candidateId: 'IT002',
      moduleCode: 'SE3050',
      grade: 'B',
    },
  ].map((record) => ({
    ...record,
    hash: sha256Hex(canonicalRecordString(record)),
  }));

  const tree = buildMerkleTree(records.map((record) => record.hash));

  return {
    verificationSource: {
      blockchain: {
        merkleRoot: `0x${tree.root}`,
        ipfsCID: 'QmWud5Mb4rZ89vnZjkaMPfqodppRLu98E1S2m1H9NUTrbg',
        timestamp: '1786976989',
        uploadedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      },
    },
    data: {
      merkleRoot: tree.root,
      totalRecords: records.length,
      generatedAt: new Date().toISOString(),
      recordsWithHashes: records,
    },
  };
}

function createService(overrides = {}) {
  const sessionStore = new Map();
  sessionStore.set('valid-token', {
    token: 'valid-token',
    institutionId: 'EMP001',
    institutionName: 'Employer Verification Portal',
    authenticated: true,
  });

  return createVerificationService({
    sessionStore,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return createDataset();
      },
    }),
    verifyProofImpl: async ({ proof }) => Boolean(proof?.ok),
    ...overrides,
  });
}

test('valid ZKP login', async () => {
  const service = createService();
  const institution = await resolveInstitution('EMP001');
  const result = await service.verifyLoginProof({
    institutionId: 'EMP001',
    proof: { ok: true },
    publicSignals: [institution.commitment],
    commitment: institution.commitment,
  });

  assert.equal(result.success, true);
  assert.equal(result.institution.id, 'EMP001');
  assert.ok(result.token);
});

test('invalid ZKP login', async () => {
  const service = createService();
  const institution = await resolveInstitution('EMP001');
  const result = await service.verifyLoginProof({
    institutionId: 'EMP001',
    proof: { ok: false },
    publicSignals: [institution.commitment],
    commitment: institution.commitment,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 403);
});

test('modified ZKP proof is rejected', async () => {
  const service = createService({
    verifyProofImpl: async ({ proof }) => proof?.signature === 'expected',
  });
  const institution = await resolveInstitution('EMP001');

  const valid = await service.verifyLoginProof({
    institutionId: 'EMP001',
    proof: { signature: 'expected' },
    publicSignals: [institution.commitment],
    commitment: institution.commitment,
  });

  const invalid = await service.verifyLoginProof({
    institutionId: 'EMP001',
    proof: { signature: 'tampered' },
    publicSignals: [institution.commitment],
    commitment: institution.commitment,
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test('valid academic grade verification', async () => {
  const service = createService();
  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
    gradeProof: { ok: true },
    gradePublicSignals: ['valid'],
  });

  assert.equal(result.valid, true);
  assert.equal(result.checks.cryptographicHash, 'VALID');
  assert.equal(result.checks.merkleProof, 'VALID');
  assert.equal(result.checks.blockchainAnchor, 'VERIFIED');
  assert.equal(result.checks.zkpVerification, 'VALID');
});

test('wrong grade is rejected', async () => {
  const service = createService();
  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'B',
    sessionToken: 'valid-token',
    gradeProof: { ok: true },
    gradePublicSignals: ['valid'],
  });

  assert.equal(result.valid, false);
  assert.equal(result.checks.cryptographicHash, 'INVALID');
});

test('unknown candidate is rejected', async () => {
  const service = createService();
  const result = await service.verifyGradeRequest({
    candidateId: 'IT999',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 404);
});

test('unknown module is rejected', async () => {
  const service = createService();
  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'UNKNOWN',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 404);
});

test('hash mismatch is detected', async () => {
  const service = createService({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        const dataset = await createDataset();
        dataset.data.recordsWithHashes[0].hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
        dataset.data.merkleRoot = normalizeMerkleRoot(dataset.data.merkleRoot);
        return dataset;
      },
    }),
  });

  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
  });

  assert.equal(result.valid, false);
  assert.equal(result.checks.cryptographicHash, 'INVALID');
});

test('merkle root mismatch is detected', async () => {
  const service = createService({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        const dataset = await createDataset();
        dataset.verificationSource.blockchain.merkleRoot = '0x' + '0'.repeat(64);
        return dataset;
      },
    }),
  });

  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
  });

  assert.equal(result.valid, false);
  assert.equal(result.checks.blockchainAnchor, 'MISMATCH');
});

test('invalid Merkle proof is detected', async () => {
  const service = createService({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        const dataset = await createDataset();
        dataset.data.recordsWithHashes[0].hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        return dataset;
      },
    }),
  });

  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
  });

  assert.equal(result.valid, false);
  assert.equal(result.checks.merkleProof, 'NOT VERIFIED');
});

test('valid ZKP grade proof', async () => {
  const service = createService({
    verifyProofImpl: async ({ proof }) => Boolean(proof?.ok),
  });

  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
    gradeProof: { ok: true },
    gradePublicSignals: ['signal'],
  });

  assert.equal(result.checks.zkpVerification, 'VALID');
});

test('invalid ZKP grade proof', async () => {
  const service = createService({
    verifyProofImpl: async ({ proof }) => Boolean(proof?.ok),
  });

  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: 'valid-token',
    gradeProof: { ok: false },
    gradePublicSignals: ['signal'],
  });

  assert.equal(result.checks.zkpVerification, 'FAILED');
});

test('unauthorized verification request is rejected', async () => {
  const service = createService();
  const result = await service.verifyGradeRequest({
    candidateId: 'IT001',
    moduleCode: 'SE3050',
    claimedGrade: 'A',
    sessionToken: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 401);
});

test('merkle proof helper round trip', () => {
  const leaves = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const tree = buildMerkleTree(leaves);
  const proof = getMerkleProof(leaves, 1);

  assert.equal(verifyMerkleProof(leaves[1], proof, tree.root), true);
  assert.equal(normalizeMerkleRoot(`0x${tree.root}`), tree.root);
});