const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const snarkjs = require('snarkjs');
const { buildPoseidon } = require('circomlibjs');

process.env.ACADEMIC_DATA_BASE_URL ||= 'http://component1.invalid/proof';

const { createVerificationService } = require('../backend/src/verification-service-clean');
const institutions = require('../backend/src/institutions-clean');
const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const wasmPath = path.resolve(__dirname, '..', 'build', 'loginVerifier_js', 'loginVerifier.wasm');
const zkeyPath = path.resolve(__dirname, '..', 'build', 'loginVerifier_final.zkey');

test('registered institution authenticates with a Groth16 proof and a tampered proof fails', async () => {
  const records = [];
  const query = (value) => ({ lean: async () => value, sort() { return this; } });
  institutions.setInstitutionModelForTests({
    findOne: (filter) => query(records.find((item) => item.institutionId === filter.institutionId && item.status === filter.status) || null),
    find: (filter) => query(records.filter((item) => item.status === filter.status)),
    exists: async ({ $or }) => records.some((item) => $or.some((condition) => Object.entries(condition).every(([key, value]) => item[key] === value))),
    create: async (value) => {
      const record = { ...value, status: 'active' };
      records.push(record);
      return { ...record, toObject: () => record };
    },
  });
  const secret = 'institution-test-secret-2026';
  const toField = (value) => BigInt(`0x${crypto.createHash('sha256').update(value.trim()).digest('hex')}`) % FIELD_MODULUS;
  const poseidon = await buildPoseidon();
  const secretField = toField(secret);
  const commitment = poseidon.F.toString(poseidon([secretField]));
  const service = createVerificationService();

  const registration = service.registerAdminInstitution
    ? await institutions.registerInstitution({ id: 'TEST-ZKP', name: 'Test Institution', commitment })
    : null;
  assert.equal(registration.success, true);

  const validProof = await snarkjs.groth16.fullProve(
    { institutionSecretField: secretField.toString() },
    wasmPath,
    zkeyPath,
  );
  const valid = await service.verifyLoginProof({ institutionId: 'TEST-ZKP', commitment, ...validProof });
  assert.equal(valid.success, true);
  assert.equal(valid.session.authType, 'zkp-institution');
  assert.equal(valid.session.role, 'institution');

  const tamperedProof = structuredClone(validProof.proof);
  tamperedProof.pi_a[0] = (BigInt(tamperedProof.pi_a[0]) + 1n).toString();
  const invalid = await service.verifyLoginProof({
    institutionId: 'TEST-ZKP',
    commitment,
    proof: tamperedProof,
    publicSignals: validProof.publicSignals,
  });
  assert.equal(invalid.success, false);
});

test.after(async () => {
  await globalThis.curve_bn128?.terminate();
  await globalThis.curve_bls12381?.terminate();
});
