const assert = require("assert");
const crypto = require("crypto");

const {
    buildMerkleTree
} = require("../utils/merkle");

const {
    uploadToIPFS,
    getFromIPFS
} = require("../utils/ipfs");

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
    }
];

async function run() {
    // =================================================
    // 1. GENERATE FINAL HASHES
    // =================================================

    const recordsWithHashes =
        records.map((record) => ({
            ...record,
            hash: generateComponent2Hash(record)
        }));


    // =================================================
    // 2. BUILD MERKLE ROOT
    // =================================================

    const hashes =
        recordsWithHashes.map(
            (record) => record.hash
        );

    const merkleRoot =
        buildMerkleTree(hashes);


    // =================================================
    // 3. CREATE FINAL IPFS PAYLOAD
    // =================================================

    const finalData = {
        recordsWithHashes,
        merkleRoot,
        totalRecords:
            recordsWithHashes.length,
        generatedAt:
            new Date().toISOString()
    };


    // =================================================
    // 4. UPLOAD TO IPFS
    // =================================================

    console.log("Uploading final proof package to IPFS...");

    const cid =
        await uploadToIPFS(finalData);

    assert.ok(
        cid,
        "IPFS should return a CID"
    );

    console.log("✅ IPFS upload successful.");
    console.log("CID:", cid);


    // =================================================
    // 5. READ DATA BACK FROM IPFS
    // =================================================

    console.log("Reading proof package back from IPFS...");

    const retrievedData =
        await getFromIPFS(cid);


    // =================================================
    // 6. VERIFY RETRIEVED DATA
    // =================================================

    assert.ok(
        retrievedData,
        "IPFS should return data"
    );

    assert.strictEqual(
        retrievedData.merkleRoot,
        merkleRoot,
        "Retrieved Merkle Root should match the generated root"
    );

    assert.strictEqual(
        retrievedData.totalRecords,
        recordsWithHashes.length,
        "Record count should match"
    );

    assert.ok(
        Array.isArray(
            retrievedData.recordsWithHashes
        ),
        "IPFS data should contain recordsWithHashes"
    );

    assert.strictEqual(
        retrievedData.recordsWithHashes[0].candidateId,
        "IT001"
    );


    console.log("✅ IPFS retrieval successful.");
    console.log("✅ Merkle Root matches.");
    console.log("✅ Finalized records retrieved correctly.");
    console.log("✅ Final IPFS proof-package test passed.");
}

run().catch((error) => {
    console.error("❌ Final test failed:", error);
    process.exit(1);
});