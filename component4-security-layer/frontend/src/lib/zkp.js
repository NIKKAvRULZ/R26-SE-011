import { buildPoseidon } from 'circomlibjs';
import { groth16 } from 'snarkjs';

const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || 'http://localhost:3001';
const LOGIN_WASM = `${BACKEND_ORIGIN}/build/loginVerifier_js/loginVerifier.wasm`;
const LOGIN_ZKEY = `${BACKEND_ORIGIN}/build/loginVerifier_final.zkey`;

async function sha256Hex(value) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function secretToFieldElement(secret) {
  const digest = await sha256Hex(secret);
  return BigInt(`0x${digest}`) % FIELD_MODULUS;
}

export async function generateLoginProof(secret, commitment) {
  const poseidon = await buildPoseidon();
  const secretField = await secretToFieldElement(secret);
  const computedCommitment = commitment ?? poseidon.F.toString(poseidon([secretField]));

  const { proof, publicSignals } = await groth16.fullProve(
    {
      institutionSecret: secretField.toString(),
      institutionCommitment: computedCommitment.toString(),
    },
    LOGIN_WASM,
    LOGIN_ZKEY,
  );

  return {
    commitment: computedCommitment.toString(),
    proof,
    publicSignals,
  };
}

export async function generateGradeProof({ candidateId, moduleCode, claimedGrade, recordHash }) {
  try {
    const { proof, publicSignals } = await groth16.fullProve(
      {
        candidateId: String(candidateId || '').trim().toUpperCase(),
        moduleCode: String(moduleCode || '').trim().toUpperCase(),
        grade: String(claimedGrade || '').trim().toUpperCase(),
        recordHash: String(recordHash || '').trim().toLowerCase().replace(/^0x/, ''),
      },
      GRADE_WASM,
      GRADE_ZKEY,
    );

    return {
      proof,
      publicSignals,
    };
  } catch (_error) {
    return null;
  }
}

async function sha256Hex(value) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function secretToFieldElement(secret) {
  const digest = await sha256Hex(secret);
  return BigInt(`0x${digest}`) % FIELD_MODULUS;
}

export async function generateLoginProof(secret, commitment) {
  const poseidon = await buildPoseidon();
  const secretField = await secretToFieldElement(secret);
  const computedCommitment = commitment ?? poseidon.F.toString(poseidon([secretField]));

  const { proof, publicSignals } = await groth16.fullProve(
    {
      institutionSecret: secretField.toString(),
      institutionCommitment: computedCommitment.toString(),
    },
    LOGIN_WASM,
    LOGIN_ZKEY,
  );

  return {
    commitment: computedCommitment.toString(),
    proof,
    publicSignals,
  };
}import * as snarkjs from 'snarkjs';

const FIELD_MODULUS = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

function normalizeSecret(secret) {
  return String(secret ?? '').trim();
}

async function secretToFieldElement(secret) {
  const normalizedSecret = normalizeSecret(secret);
  const buffer = new TextEncoder().encode(normalizedSecret);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = Array.from(new Uint8Array(digest));
  const hexValue = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return (BigInt(`0x${hexValue}`) % FIELD_MODULUS).toString();
}

async function generateLoginProof({ secret, commitment }) {
  const secretValue = await secretToFieldElement(secret);
  const proofInput = {
    institutionSecretField: secretValue,
    institutionCommitment: commitment,
  };

  const wasmUrl = '/api/auth/artifacts/login/wasm';
  const zkeyUrl = '/api/auth/artifacts/login/zkey';
  return snarkjs.groth16.fullProve(proofInput, wasmUrl, zkeyUrl);
}

export { generateLoginProof, secretToFieldElement };
