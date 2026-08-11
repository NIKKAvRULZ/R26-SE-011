const {
    buildMerkleTree,
    getMerkleProof,
    verifyMerkleProof
} = require("../utils/merkle");

const hashes = [
    "abc123",
    "def456",
    "ghi789"
];

// Build official Merkle Root
const merkleRoot = buildMerkleTree(hashes);

// Generate proof for IT001
const proof = getMerkleProof(hashes, 0);

// Verify IT001
const isValid = verifyMerkleProof(
    hashes[0],
    proof,
    merkleRoot
);

console.log("Merkle Root:", merkleRoot);
console.log("Proof:", proof);
console.log("Verification Result:", isValid);