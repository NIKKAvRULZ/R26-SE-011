const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
import { groth16 } from 'snarkjs';

const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || 'http://localhost:3000';
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
  const secretField = await secretToFieldElement(secret);
  if (!commitment) {
    throw new Error('The institution commitment is required to generate a login proof');
  }

  const { proof, publicSignals } = await groth16.fullProve(
    {
      institutionSecretField: secretField.toString(),
      institutionCommitment: String(commitment),
    },
    LOGIN_WASM,
    LOGIN_ZKEY,
  );

  return { commitment: String(commitment), proof, publicSignals };
}
