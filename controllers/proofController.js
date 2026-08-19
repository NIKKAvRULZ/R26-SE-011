const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const {
    buildMerkleTree
} = require("../utils/merkle");

const {
    uploadToIPFS,
    getFromIPFS
} = require("../utils/ipfs");

// =====================================================
// LOAD SMART CONTRACT ABI
// =====================================================

const contractArtifact = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "ProofStorage.json"),
        "utf8"
    )
);

const CONTRACT_ABI = contractArtifact.abi;


// =====================================================
// BLOCKCHAIN CONFIGURATION
// =====================================================

const CONTRACT_ADDRESS =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const BLOCKCHAIN_RPC_URL =
    "http://127.0.0.1:8545";


// =====================================================
// COMPONENT 2 HASH VERIFICATION
// =====================================================

function verifyComponent2Hash(record) {
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


// =====================================================
// GENERATE PROOF MANIFEST
// =====================================================

exports.generateProofManifest = async (req, res) => {
    try {

        // =================================================
        // GET RECORDS FROM REQUEST
        // =================================================

        const { records } = req.body;

        if (
            !records ||
            !Array.isArray(records) ||
            records.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Payload missing valid academic records array."
            });
        }


        // =================================================
        // PHASE 1 — ACCEPT & VALIDATE HASHES
        // =================================================
const finalizedRecords = records.map((record) => {

    // Validate required fields
    if (
        !record.candidateId ||
        !record.moduleCode ||
        record.marks === undefined ||
        !record.grade ||
        record.version === undefined ||
        !record.hash
    ) {
        throw new Error(
            `Incomplete record received for candidate ${record.candidateId || "unknown"}`
        );
    }

    // Recalculate the expected Component 2 hash
    const expectedHash = verifyComponent2Hash(record);

    // Reject the entire batch if the hash is incorrect
    if (record.hash !== expectedHash) {
        throw new Error(
            `Hash verification failed for candidate ${record.candidateId}`
        );
    }

    return {
        candidateId: record.candidateId,
        moduleCode: record.moduleCode,
        marks: Number(record.marks),
        grade: record.grade,
        version: Number(record.version),
        hash: record.hash
    };
});


        // =================================================
        // EXTRACT LEAF HASHES
        // =================================================

        const leafHashes =
            finalizedRecords.map(
                (record) => record.hash
            );


        // =================================================
        // PHASE 2 — BUILD MERKLE ROOT
        // =================================================

        const globalMerkleRoot =
            buildMerkleTree(leafHashes);

        if (!globalMerkleRoot) {
            return res.status(500).json({
                success: false,
                message:
                    "Merkle Root generation failed."
            });
        }

        console.log(
            "Generated Merkle Root:",
            globalMerkleRoot
        );


        // =================================================
        // PHASE 3 — CREATE IPFS PAYLOAD
        // =================================================

        const ipfsPayload = {
            recordsWithHashes:
                finalizedRecords,

            merkleRoot:
                globalMerkleRoot,

            totalRecords:
                finalizedRecords.length,

            generatedAt:
                new Date().toISOString()
        };


        // =================================================
        // UPLOAD PROOF MANIFEST TO IPFS
        // =================================================

        console.log(
            "Uploading grade proof manifest to IPFS via Pinata..."
        );

        const ipfsCID =
            await uploadToIPFS(ipfsPayload);

        console.log(
            "Successfully uploaded to IPFS."
        );

        console.log(
            "IPFS CID:",
            ipfsCID
        );


        // =================================================
        // PHASE 8 — ANCHOR DATA ON BLOCKCHAIN
        // =================================================

        console.log(
            "Connecting to local private blockchain node..."
        );

        const provider =
            new ethers.JsonRpcProvider(
                BLOCKCHAIN_RPC_URL
            );


        // =================================================
        // CHECK CONTRACT DEPLOYMENT
        // =================================================

        const contractCode =
            await provider.getCode(
                CONTRACT_ADDRESS
            );

        if (contractCode === "0x") {
            throw new Error(
                `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
            );
        }


        // =================================================
        // GET HARDHAT SIGNER
        // =================================================

        const signer =
            await provider.getSigner(0);


        // =================================================
        // CREATE CONTRACT INSTANCE
        // =================================================

        const proofStorageContract =
            new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                signer
            );


        // =================================================
        // FORMAT MERKLE ROOT
        // =================================================

        const formattedMerkleRoot =
            globalMerkleRoot.startsWith("0x")
                ? globalMerkleRoot
                : `0x${globalMerkleRoot}`;


        console.log(
            `Submitting anchoring transaction for Merkle Root: ${formattedMerkleRoot}`
        );


        // =================================================
        // STORE PROOF ON BLOCKCHAIN
        // =================================================

        const tx =
            await proofStorageContract.storeProof(
                formattedMerkleRoot,
                ipfsCID
            );

        console.log(
            `Transaction sent! Hash: ${tx.hash}. Waiting for block confirmation...`
        );


        // =================================================
        // WAIT FOR TRANSACTION CONFIRMATION
        // =================================================

        const receipt =
            await tx.wait();

        console.log(
            "Transaction successfully anchored in block number:",
            receipt.blockNumber
        );


        // =================================================
        // PHASE 9 — COMPLETE RESPONSE
        // =================================================

        return res.status(200).json({
            success: true,

            message:
                "Cryptographic layer proofs successfully minted and permanently anchored to blockchain ledger.",

            blockchainTx: {
                transactionHash:
                    tx.hash,

                blockNumber:
                    receipt.blockNumber,

                contractAddress:
                    CONTRACT_ADDRESS,

                anchoredBy:
                    receipt.from
            },

            proofData: {
                merkleRoot:
                    globalMerkleRoot,

                ipfsCID:
                    ipfsCID,

                totalRecordsProcessed:
                    finalizedRecords.length,

                storageStatus:
                    "Decentralized IPFS Immutable Storage Layer Confirmed",

                blockchainReady:
                    true
            }
        });

    } catch (error) {

        console.error(
            "Pipeline failure in integrated backend generation:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Internal server processing failure or blockchain anchoring rejection.",

            error:
                error.message
        });
    }
};


// =====================================================
// READ ANCHORED PROOF FROM BLOCKCHAIN
// =====================================================

exports.getAnchoredProof = async (req, res) => {
    try {

        // =================================================
        // GET MERKLE ROOT FROM URL
        // =================================================

        let { merkleRoot } =
            req.params;


        // Add 0x prefix if needed
        if (!merkleRoot.startsWith("0x")) {
            merkleRoot =
                `0x${merkleRoot}`;
        }


        // =================================================
        // VALIDATE MERKLE ROOT
        // =================================================

        if (
            !/^0x[a-fA-F0-9]{64}$/.test(
                merkleRoot
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid Merkle Root format."
            });
        }


        console.log(
            "Reading proof from blockchain..."
        );

        console.log(
            "Merkle Root:",
            merkleRoot
        );


        // =================================================
        // READ-ONLY BLOCKCHAIN CONNECTION
        // =================================================

        const provider =
            new ethers.JsonRpcProvider(
                BLOCKCHAIN_RPC_URL
            );


        // =================================================
        // CHECK CONTRACT DEPLOYMENT
        // =================================================

        const contractCode =
            await provider.getCode(
                CONTRACT_ADDRESS
            );

        if (contractCode === "0x") {
            throw new Error(
                `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
            );
        }


        // =================================================
        // CREATE READ-ONLY CONTRACT INSTANCE
        // =================================================

        const proofStorageContract =
            new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                provider
            );


        // =================================================
        // READ PROOF STORED FOR MERKLE ROOT
        // =================================================

        const proof =
            await proofStorageContract.getProof(
                merkleRoot
            );


        // =================================================
        // EXTRACT STORED VALUES
        // =================================================

        const ipfsCID =
            proof[0];

        const timestamp =
            proof[1];

        const uploadedBy =
            proof[2];


        // =================================================
        // RETURN BLOCKCHAIN PROOF
        // =================================================

        return res.status(200).json({
            success: true,

            proof: {
                merkleRoot:
                    merkleRoot,

                ipfsCID:
                    ipfsCID,

                timestamp:
                    timestamp.toString(),

                uploadedBy:
                    uploadedBy
            }
        });

    } catch (error) {

        console.error(
            "Blockchain read error:",
            error
        );

        return res.status(404).json({
            success: false,

            message:
                "No blockchain proof found for this Merkle Root.",

            error:
                error.message
        });
    }
};


// =====================================================
// GET FINALIZED PROOF DATA FROM IPFS
// FOR COMPONENT 4
// =====================================================

exports.getProofData = async (req, res) => {
    try {

        // =================================================
        // GET MERKLE ROOT FROM URL
        // =================================================

        let { merkleRoot } =
            req.params;


        // Add 0x prefix if needed
        if (!merkleRoot.startsWith("0x")) {
            merkleRoot =
                `0x${merkleRoot}`;
        }


        // =================================================
        // VALIDATE MERKLE ROOT
        // =================================================

        if (
            !/^0x[a-fA-F0-9]{64}$/.test(
                merkleRoot
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid Merkle Root format."
            });
        }


        console.log(
            "Retrieving finalized proof data..."
        );

        console.log(
            "Requested Merkle Root:",
            merkleRoot
        );


        // =================================================
        // CONNECT TO BLOCKCHAIN
        // =================================================

        const provider =
            new ethers.JsonRpcProvider(
                BLOCKCHAIN_RPC_URL
            );


        // =================================================
        // CHECK CONTRACT DEPLOYMENT
        // =================================================

        const contractCode =
            await provider.getCode(
                CONTRACT_ADDRESS
            );

        if (contractCode === "0x") {
            throw new Error(
                `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
            );
        }


        // =================================================
        // READ PROOF FROM BLOCKCHAIN
        // =================================================

        const proofStorageContract =
            new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                provider
            );


        const proof =
            await proofStorageContract.getProof(
                merkleRoot
            );


        // =================================================
        // EXTRACT OFFICIAL BLOCKCHAIN VALUES
        // =================================================

        const ipfsCID =
            proof[0];

        const timestamp =
            proof[1];

        const uploadedBy =
            proof[2];


        // =================================================
        // RETRIEVE JSON FROM IPFS
        // =================================================

        const ipfsData =
            await getFromIPFS(
                ipfsCID
            );


        // =================================================
        // VERIFY IPFS DATA MATCHES BLOCKCHAIN ROOT
        // =================================================

        if (
            !ipfsData ||
            !ipfsData.merkleRoot
        ) {
            return res.status(500).json({
                success: false,
                message:
                    "IPFS data does not contain a Merkle Root."
            });
        }


        const normalizedIPFSRoot =
            ipfsData.merkleRoot.startsWith("0x")
                ? ipfsData.merkleRoot
                : `0x${ipfsData.merkleRoot}`;


        if (
            normalizedIPFSRoot.toLowerCase() !==
            merkleRoot.toLowerCase()
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "IPFS data does not match the blockchain Merkle Root.",
                blockchainMerkleRoot:
                    merkleRoot,
                ipfsMerkleRoot:
                    normalizedIPFSRoot
            });
        }


        // =================================================
        // RETURN FINALIZED DATA TO COMPONENT 4
        // =================================================

        return res.status(200).json({
            success: true,

            verificationSource: {
                blockchain: {
                    merkleRoot:
                        merkleRoot,

                    ipfsCID:
                        ipfsCID,

                    timestamp:
                        timestamp.toString(),

                    uploadedBy:
                        uploadedBy
                }
            },

            data: ipfsData
        });

    } catch (error) {

        console.error(
            "Finalized proof data retrieval error:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Unable to retrieve finalized proof data from IPFS.",

            error:
                error.message
        });
    }
};