const assert = require("assert");
const crypto = require("crypto");

const {
    buildMerkleTree
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
    },
    {
        candidateId: "IT004",
        moduleCode: "SE3050",
        marks: 68,
        grade: "B",
        version: 1
    }
];

// Generate the finalized student hashes
const hashes = records.map(generateComponent2Hash);

// Build Merkle Root
const root = buildMerkleTree(hashes);

assert.strictEqual(
    typeof root,
    "string",
    "Merkle Root should be a string"
);

assert.strictEqual(
    root.length,
    64,
    "Merkle Root should contain 64 hexadecimal characters"
);

assert.match(
    root,
    /^[a-f0-9]{64}$/,
    "Merkle Root should be a valid SHA-256 hexadecimal value"
);

console.log("✅ Merkle Tree generated successfully.");
console.log("Number of records:", records.length);
console.log("Merkle Root:", root);