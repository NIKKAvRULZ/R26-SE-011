const crypto = require('crypto');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function canonicalizeIdentifier(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '');
}

function canonicalizeGrade(value) {
  return normalizeText(value).toUpperCase();
}

function canonicalizeRecord(record) {
  return {
    candidateId: canonicalizeIdentifier(record?.candidateId),
    moduleCode: canonicalizeIdentifier(record?.moduleCode),
    grade: canonicalizeGrade(record?.grade),
  };
}

function canonicalRecordString(record) {
  const normalized = canonicalizeRecord(record);
  return [normalized.candidateId, normalized.moduleCode, normalized.grade].join('|');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeMerkleRoot(value) {
  return normalizeText(value).toLowerCase().replace(/^0x/, '');
}

function normalizeHexLeaf(value) {
  return normalizeText(value).toLowerCase().replace(/^0x/, '');
}

function leafToBuffer(value) {
  const normalized = normalizeText(value).replace(/^0x/i, '');
  if (/^[0-9a-f]+$/i.test(normalized) && normalized.length % 2 === 0) {
    return Buffer.from(normalized, 'hex');
  }

  return Buffer.from(normalized, 'utf8');
}

function hashPair(left, right) {
  return crypto
    .createHash('sha256')
    .update(Buffer.concat([leafToBuffer(left), leafToBuffer(right)]))
    .digest('hex');
}

function buildMerkleLevels(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error('Merkle tree requires at least one leaf');
  }

  const levels = [leaves.map((leaf) => normalizeHexLeaf(leaf))];

  while (levels[levels.length - 1].length > 1) {
    const currentLevel = levels[levels.length - 1];
    const nextLevel = [];

    for (let index = 0; index < currentLevel.length; index += 2) {
      const left = currentLevel[index];
      const right = currentLevel[index + 1] ?? currentLevel[index];
      nextLevel.push(hashPair(left, right));
    }

    levels.push(nextLevel);
  }

  return levels;
}

function buildMerkleTree(leaves) {
  const levels = buildMerkleLevels(leaves);

  return {
    levels,
    root: normalizeMerkleRoot(levels[levels.length - 1][0]),
  };
}

function getMerkleProof(leaves, leafIndex) {
  const levels = buildMerkleLevels(leaves);

  if (leafIndex < 0 || leafIndex >= levels[0].length) {
    throw new Error('Leaf index is out of bounds');
  }

  const proof = [];
  let index = leafIndex;

  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const level = levels[levelIndex];
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    const sibling = level[siblingIndex] ?? level[index];

    proof.push({
      position: isRightNode ? 'left' : 'right',
      sibling: normalizeHexLeaf(sibling),
    });

    index = Math.floor(index / 2);
  }

  return proof;
}

function verifyMerkleProof(leaf, proof, expectedRoot) {
  let computed = normalizeHexLeaf(leaf);

  for (const step of proof ?? []) {
    const sibling = normalizeHexLeaf(step.sibling);

    if (step.position === 'left') {
      computed = hashPair(sibling, computed);
    } else {
      computed = hashPair(computed, sibling);
    }
  }

  return normalizeMerkleRoot(computed) === normalizeMerkleRoot(expectedRoot);
}

function gradeToGpa(grade) {
  const normalized = canonicalizeGrade(grade);
  const gradeMap = {
    'A+': 4.0,
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    'D+': 1.3,
    D: 1.0,
    F: 0.0,
  };

  return gradeMap[normalized] ?? null;
}

module.exports = {
  buildMerkleTree,
  canonicalRecordString,
  canonicalizeGrade,
  canonicalizeIdentifier,
  gradeToGpa,
  getMerkleProof,
  hashPair,
  normalizeMerkleRoot,
  sha256Hex,
  verifyMerkleProof,
};