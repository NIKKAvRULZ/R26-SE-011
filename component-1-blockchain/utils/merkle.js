const crypto = require("crypto");

function hash(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function buildMerkleTree(hashes) {
    if (hashes.length === 1) {
        return hashes[0];
    }

    const newLevel = [];

    for (let i = 0; i < hashes.length; i += 2) {
        if (i + 1 < hashes.length) {
            newLevel.push(hash(hashes[i] + hashes[i + 1]));
        } else {
            // if odd number, duplicate last
            newLevel.push(hash(hashes[i] + hashes[i]));
        }
    }

    return buildMerkleTree(newLevel);
}
function getMerkleProof(hashes, targetIndex) {
    let proof = [];
    let currentLevel = [...hashes];
    let index = targetIndex;

    while (currentLevel.length > 1) {
        // If there is an odd number of hashes,
        // duplicate the last hash
        if (currentLevel.length % 2 !== 0) {
            currentLevel.push(currentLevel[currentLevel.length - 1]);
        }

        const isRightNode = index % 2 === 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;

        proof.push({
            hash: currentLevel[siblingIndex],
            position: isRightNode ? "left" : "right"
        });

        const nextLevel = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            nextLevel.push(
                hash(currentLevel[i] + currentLevel[i + 1])
            );
        }

        index = Math.floor(index / 2);
        currentLevel = nextLevel;
    }

    return proof;
}
function verifyMerkleProof(leafHash, proof, merkleRoot) {
    let currentHash = leafHash;

    for (const step of proof) {
        if (step.position === "left") {
            currentHash = hash(step.hash + currentHash);
        } else {
            currentHash = hash(currentHash + step.hash);
        }
    }

    return currentHash === merkleRoot;
}
module.exports = {
    buildMerkleTree,
    getMerkleProof,
    verifyMerkleProof
};