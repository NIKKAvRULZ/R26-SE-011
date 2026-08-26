const assert = require("assert");
const crypto = require("crypto");

const {
    buildMerkleTree,
    getMerkleProof
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

// Official root
const merkleRoot = buildMerkleTree(hashes);

// IT001 is at index 0
const targetIndex = 0;

const proof = getMerkleProof(
    hashes,
    targetIndex
);

assert.ok(
    Array.isArray(proof),
    "Merkle proof should be an array"
);

assert.ok(
    proof.length > 0,
    "Merkle proof should contain at least one proof step"
);

console.log("✅ Merkle Proof generated successfully.");
console.log("Candidate:", records[targetIndex].candidateId);
console.log("Leaf Hash:", hashes[targetIndex]);
console.log("Merkle Root:", merkleRoot);
console.log("Proof:");
console.dir(proof, { depth: null });