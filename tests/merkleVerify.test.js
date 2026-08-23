const assert = require("assert");
const crypto = require("crypto");

const {
    buildMerkleTree,
    getMerkleProof,
    verifyMerkleProof
} = require("../utils/merkle");

function generateComponent2Hash(record) {
    const hashData = `
      ${record.candidateId}
      ${record.moduleCode}
      ${record.marks}
      ${record.grade}
      ${record.version}
    `;

    return crypto
        .createHash("sha256")
        .update(hashData)
        .digest("hex");
}

const records = [
    {
        candidateId: "IT001",
        moduleCode: "SE3050",
        marks: 85,
        grade: "A",
        version: 2
    },
    {
        candidateId: "IT002",
        moduleCode: "SE3050",
        marks: 72,
        grade: "B",
        version: 1
    },
    {
        candidateId: "IT003",
        moduleCode: "SE3050",
        marks: 91,
        grade: "A+",
        version: 3
    }
];

const hashes = records.map(generateComponent2Hash);

const merkleRoot = buildMerkleTree(hashes);

const targetIndex = 0;

const proof = getMerkleProof(
    hashes,
    targetIndex
);

// =====================================================
// VALID RECORD
// =====================================================

const validResult = verifyMerkleProof(
    hashes[targetIndex],
    proof,
    merkleRoot
);

assert.strictEqual(
    validResult,
    true,
    "Valid record should pass Merkle verification"
);

console.log("✅ Valid record verification: TRUE");


// =====================================================
// TAMPERED RECORD
// =====================================================

// Change the student's data and generate another hash.
const tamperedRecord = {
    ...records[targetIndex],
    marks: 95
};

const tamperedHash =
    generateComponent2Hash(
        tamperedRecord
    );

const tamperedResult =
    verifyMerkleProof(
        tamperedHash,
        proof,
        merkleRoot
    );

assert.strictEqual(
    tamperedResult,
    false,
    "Tampered record should fail Merkle verification"
);

console.log("✅ Tampered record verification: FALSE");
console.log("✅ Merkle tamper detection test passed.");