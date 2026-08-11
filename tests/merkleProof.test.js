const { getMerkleProof } = require("../utils/merkle");

const hashes = [
    "abc123",
    "def456",
    "ghi789"
];

const proof = getMerkleProof(hashes, 0);

console.log("Merkle Proof for IT001:");
console.log(proof);