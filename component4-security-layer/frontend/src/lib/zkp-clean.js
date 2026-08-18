const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

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
  const computedCommitment = commitment ?? (await sha256Hex(secretField.toString()));

  return {
    commitment: computedCommitment,
    proof: {
      commitment: computedCommitment,
      secretDigest: await sha256Hex(secret),
    },
    publicSignals: [computedCommitment],
  };
}
