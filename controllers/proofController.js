const crypto = require("crypto");
const { buildMerkleTree } = require("../utils/merkle");
const { uploadToIPFS } = require("../utils/ipfs");

// Standardized helper function matching Component 2's exact string format
function verifyComponent2Hash(record) {
    // This template literal contains the exact multi-line space spacing used in Component 2
    const hashData = `
      ${record.candidateId}
      ${record.moduleCode}
      ${record.marks}
      ${record.grade}
      ${record.version}
    `;
    return crypto.createHash("sha256").update(hashData).digest("hex");
}

exports.generateProofManifest = async (req, res) => {
    try {
        const { records } = req.body;

        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Payload missing valid academic records array." 
            });
        }

        // =======================================
        // PHASE 1 — ACCEPT & VALIDATE HASHES
        // =======================================
        const finalizedRecords = records.map((record) => {
            const doubleCheckHash = verifyComponent2Hash(record);
            
            // If Component 2 didn't supply a hash, or if it doesn't match our validation, log it
            if (record.hash && record.hash !== doubleCheckHash) {
                console.warn(`[Warning] Hash mismatch detected for Candidate: ${record.candidateId}`);
            }

            return {
                candidateId: record.candidateId,
                moduleCode: record.moduleCode,
                marks: Number(record.marks),
                grade: record.grade,
                version: Number(record.version),
                hash: record.hash || doubleCheckHash // Fallback to our generated hash
            };
        });

        // Extract clean array list of string hashes for the Merkle tree
        const leafHashes = finalizedRecords.map(r => r.hash);

        // =======================================
        // PHASE 2 — BUILD MERKLE ROOT
        // =======================================
        const globalMerkleRoot = buildMerkleTree(leafHashes);

        if (!globalMerkleRoot) {
            return res.status(500).json({ success: false, message: "Merkle Root generation failed." });
        }

        // =======================================
        // PHASE 3B — FINAL IPFS PAYLOAD STRUCTURE
        // =======================================
        const ipfsPayload = {
            recordsWithHashes: finalizedRecords,
            merkleRoot: globalMerkleRoot,
            totalRecords: finalizedRecords.length,
            generatedAt: new Date().toISOString()
        };

        // =======================================
        // PHASE 3A — UPLOAD DATA TO IPFS
        // =======================================
        console.log("Uploading grade proof manifest to IPFS via Pinata...");
        const ipfsCID = await uploadToIPFS(ipfsPayload);

        // =======================================
        // PHASE 3C — CLEAN PROOF RESPONSE
        // =======================================
        return res.status(200).json({
            success: true,
            merkleRoot: globalMerkleRoot,
            cid: ipfsCID,
            totalRecords: finalizedRecords.length,
            generatedAt: ipfsPayload.generatedAt,
            records: finalizedRecords
        });

    } catch (error) {
        console.error("Pipeline failure in Component 1 backend generation:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server processing failure.",
            error: error.message 
        });
    }
};