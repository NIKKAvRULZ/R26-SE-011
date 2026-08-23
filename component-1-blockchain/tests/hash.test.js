const assert = require("assert");
const crypto = require("crypto");

// Same hash format used by Component 2
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

const record = {
    candidateId: "IT001",
    moduleCode: "SE3050",
    marks: 85,
    grade: "A",
    version: 2
};

const hash = generateComponent2Hash(record);

assert.strictEqual(
    typeof hash,
    "string",
    "Hash should be a string"
);

assert.strictEqual(
    hash.length,
    64,
    "SHA-256 hash should contain 64 hexadecimal characters"
);

assert.match(
    hash,
    /^[a-f0-9]{64}$/,
    "Hash should be a valid SHA-256 hexadecimal value"
);

console.log("✅ Component 2 compatible SHA-256 hash generated successfully.");
console.log("Candidate:", record.candidateId);
console.log("Hash:", hash);