"use strict";

const crypto = require("node:crypto");
const { buildPoseidon } = require("circomlibjs");

const BN254_FIELD = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

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
  F: 0,
};

const LETTER_TO_NUMERIC_GRADE = {
  F: 0,
  D: 1,
  C: 2,
  "C+": 2,
  "C-": 2,
  B: 3,
  "B+": 3,
  "B-": 3,
  A: 4,
  "A+": 5,
  "A-": 4,
};

function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeIdentifier(value) {
  return normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeGrade(value) {
  return normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
}

function canonicalizeGradeClaim(candidateId, moduleCode, grade) {
  return [
    normalizeIdentifier(candidateId),
    normalizeIdentifier(moduleCode),
    normalizeGrade(grade),
  ].join("|");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function sha256ToField(value) {
  return BigInt(`0x${sha256Hex(value)}`) % BN254_FIELD;
}

async function poseidonCommitmentFromField(fieldValue) {
  const poseidon = await buildPoseidon();
  const hash = poseidon([BigInt(fieldValue)]);
  return poseidon.F.toString(hash);
}

async function poseidonCommitmentFromSecret(secretValue) {
  return poseidonCommitmentFromField(sha256ToField(normalizeWhitespace(secretValue)));
}

function merkleParent(leftHash, rightHash) {
  return sha256Hex(Buffer.concat([
    Buffer.from(leftHash, "hex"),
    Buffer.from(rightHash, "hex"),
  ]));
}

function buildMerkleTree(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error("Cannot build a Merkle tree without leaves");
  }

  const normalizedLeaves = leaves.map((leaf) => sha256Hex(leaf));
  const layers = [normalizedLeaves];

  while (layers.at(-1).length > 1) {
    const previousLayer = layers.at(-1);
    const nextLayer = [];

    for (let index = 0; index < previousLayer.length; index += 2) {
      const leftHash = previousLayer[index];
      const rightHash = previousLayer[index + 1] ?? leftHash;
      nextLayer.push(merkleParent(leftHash, rightHash));
    }

    layers.push(nextLayer);
  }

  const root = layers.at(-1)[0];

  const proofs = normalizedLeaves.map((_, leafIndex) => {
    const proof = [];
    let position = leafIndex;

    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
      const layer = layers[layerIndex];
      const isRightNode = position % 2 === 1;
      const siblingIndex = isRightNode ? position - 1 : position + 1;
      const siblingHash = layer[siblingIndex] ?? layer[position];

      proof.push({
        position: isRightNode ? "left" : "right",
        hash: siblingHash,
      });

      position = Math.floor(position / 2);
    }

    return proof;
  });

  return { root, layers, proofs, leaves: normalizedLeaves };
}

function verifyMerkleProof(leafHash, proof, rootHash) {
  let currentHash = sha256Hex(leafHash);

  for (const step of proof) {
    if (!step?.hash || !step?.position) {
      return false;
    }

    const siblingHash = sha256Hex(step.hash);
    currentHash = step.position === "left"
      ? merkleParent(siblingHash, currentHash)
      : merkleParent(currentHash, siblingHash);
  }

  return currentHash === sha256Hex(rootHash);
}

function gradeToNumeric(gradeValue) {
  if (gradeValue === undefined || gradeValue === null) {
    return undefined;
  }

  if (typeof gradeValue === "number" && Number.isInteger(gradeValue)) {
    return gradeValue;
  }

  const normalized = normalizeGrade(gradeValue);
  if (/^[0-5]$/.test(normalized)) {
    return Number(normalized);
  }

  return LETTER_TO_NUMERIC_GRADE[normalized];
}

function numericToGrade(numericGrade) {
  switch (Number(numericGrade)) {
    case 0:
      return "F";
    case 1:
      return "D";
    case 2:
      return "C";
    case 3:
      return "B";
    case 4:
      return "A";
    case 5:
      return "A+";
    default:
      return undefined;
  }
}

module.exports = {
  BN254_FIELD,
  GRADE_POINTS,
  canonicalizeGradeClaim,
  gradeToNumeric,
  merkleParent,
  normalizeGrade,
  normalizeIdentifier,
  normalizeWhitespace,
  numericToGrade,
  poseidonCommitmentFromField,
  poseidonCommitmentFromSecret,
  sha256Hex,
  sha256ToField,
  buildMerkleTree,
  verifyMerkleProof,
};
