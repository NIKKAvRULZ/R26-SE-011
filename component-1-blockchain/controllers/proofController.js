const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const {
    buildMerkleTree,
    getMerkleProof,
    verifyMerkleProof
} = require("../utils/merkle");

const {
    uploadToIPFS,
    getFromIPFS
} = require("../utils/ipfs");

const ResultProofIndex =
    require("../models/ResultProofIndex");


// =====================================================
// LOAD SMART CONTRACT ABI
// =====================================================

const contractArtifact = JSON.parse(
    fs.readFileSync(
        path.join(
            __dirname,
            "ProofStorage.json"
        ),
        "utf8"
    )
);

const CONTRACT_ABI =
    contractArtifact.abi;


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
//
// Must exactly match Component 2:
//
// candidateId|moduleCode|marks|grade|version
//
// =====================================================

function verifyComponent2Hash(record) {

    const hashData = [
        record.candidateId,
        record.moduleCode,
        record.marks,
        record.grade,
        record.version
    ].join("|");


    return crypto
        .createHash("sha256")
        .update(hashData)
        .digest("hex");
}


// =====================================================
// GENERATE PROOF MANIFEST
// =====================================================
//
// POST /generate-proof
//
// POST /blockchain/storeHash
//
// =====================================================

exports.generateProofManifest =
    async (req, res) => {

        try {

            const {
                records
            } = req.body;


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
            // PHASE 1 — VALIDATE COMPONENT 2 RECORDS
            // =================================================

            const finalizedRecords =
                records.map((record) => {

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


                    const expectedHash =
                        verifyComponent2Hash(record);


                    if (
                        record.hash !==
                        expectedHash
                    ) {

                        throw new Error(
                            `Hash verification failed for candidate ${record.candidateId}`
                        );
                    }


                    return {

                        candidateId:
                            record.candidateId,

                        moduleCode:
                            record.moduleCode,

                        marks:
                            Number(record.marks),

                        grade:
                            record.grade,

                        version:
                            Number(record.version),

                        hash:
                            record.hash
                    };

                });


            // =================================================
            // EXTRACT MERKLE LEAF HASHES
            // =================================================

            const leafHashes =
                finalizedRecords.map(
                    (record) =>
                        record.hash
                );


            // =================================================
            // BUILD MERKLE ROOT
            // =================================================

            const globalMerkleRoot =
                buildMerkleTree(
                    leafHashes
                );


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
            // CREATE IPFS PAYLOAD
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
            // UPLOAD TO IPFS
            // =================================================

            console.log(
                "Uploading grade proof manifest to IPFS via Pinata..."
            );


            const ipfsCID =
                await uploadToIPFS(
                    ipfsPayload
                );


            console.log(
                "Successfully uploaded to IPFS."
            );


            console.log(
                "IPFS CID:",
                ipfsCID
            );


            // =================================================
            // CONNECT TO BLOCKCHAIN
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


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            // =================================================
            // GET SIGNER
            // =================================================

            const signer =
                await provider.getSigner(0);


            // =================================================
            // CONTRACT INSTANCE
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
            // WAIT FOR CONFIRMATION
            // =================================================

            const receipt =
                await tx.wait();


            console.log(
                "Transaction successfully anchored in block number:",
                receipt.blockNumber
            );


            // =================================================
            // STORE CANDIDATE -> ROOT/CID LOOKUP INDEX
            // =================================================
            //
            // IMPORTANT:
            // This happens ONLY after the blockchain
            // transaction has been confirmed.
            //
            // Version is intentionally NOT stored in this
            // lookup index.
            //
            // =================================================
// =====================================================
// STORE CANDIDATE -> ROOT/CID LOOKUP INDEX
// =====================================================
//
// Blockchain anchoring has already succeeded at this point.
//
// A MongoDB index failure must NOT turn a successful
// blockchain anchor into HTTP 500. Otherwise Component 2
// may retry the same Merkle Root, which the smart contract
// correctly rejects as already anchored.
//
// =====================================================

const anchoredAt = new Date();

const indexDocuments =
    finalizedRecords.map(
        (record) => ({
            candidateId:
                record.candidateId,

            moduleCode:
                record.moduleCode,

            merkleRoot:
                formattedMerkleRoot,

            ipfsCID:
                ipfsCID,

            anchoredAt:
                anchoredAt
        })
    );

let proofIndexReady = true;
let proofIndexError = null;

try {

    if (indexDocuments.length > 0) {

        await ResultProofIndex.insertMany(
            indexDocuments
        );
    }

    console.log(
        `Proof lookup index updated for ${indexDocuments.length} record(s).`
    );

} catch (indexError) {

    proofIndexReady = false;

    proofIndexError =
        indexError.message;

    console.error(
        "Blockchain anchor succeeded, but Proof Index update failed:",
        indexError.message
    );
}


            // =================================================
            // RETURN RESPONSE
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

    indexRecordsStored:
        proofIndexReady
            ? indexDocuments.length
            : 0,

    storageStatus:
        "Decentralized IPFS Immutable Storage Layer Confirmed",

    blockchainReady:
        true,

    proofIndexReady:
        proofIndexReady,

    proofIndexError:
        proofIndexError
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
// GET LATEST ANCHORED PROOF
// =====================================================
//
// GET /proof/latest
//
// Uses the ProofAnchored blockchain event instead of
// getLatestProof(), so the existing contract ABI is enough.
//
// =====================================================

exports.getLatestProof =
    async (req, res) => {

        try {

            console.log(
                "Reading latest anchored proof from blockchain event..."
            );


            // =================================================
            // READ-ONLY PROVIDER
            // =================================================

            const provider =
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


            // =================================================
            // CHECK CONTRACT
            // =================================================

            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            // =================================================
            // CONTRACT INSTANCE
            // =================================================

            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );


            // =================================================
            // GET PROOF ANCHORED EVENTS
            // =================================================

            const filter =
                proofStorageContract.filters.ProofAnchored();


            const events =
                await proofStorageContract.queryFilter(
                    filter,
                    0,
                    "latest"
                );


            // =================================================
            // NO EVENTS
            // =================================================

            if (
                !events ||
                events.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "No latest anchored proof is available."
                });
            }


            // =================================================
            // MOST RECENT EVENT
            // =================================================

            const latestEvent =
                events[events.length - 1];


            const eventArgs =
                latestEvent.args;


            const merkleRoot =
                eventArgs?.merkleRoot ||
                eventArgs?.[0];


            const ipfsCID =
                eventArgs?.ipfsCID ||
                eventArgs?.[1];


            const uploadedBy =
                eventArgs?.uploadedBy ||
                eventArgs?.[2];


            if (
                !merkleRoot ||
                !ipfsCID
            ) {

                throw new Error(
                    "Latest ProofAnchored event did not contain a Merkle Root and IPFS CID."
                );
            }


            // =================================================
            // BLOCK TIMESTAMP
            // =================================================

            let timestamp =
                null;


            try {

                const block =
                    await provider.getBlock(
                        latestEvent.blockNumber
                    );


                if (block) {

                    timestamp =
                        block.timestamp;
                }

            } catch (timestampError) {

                console.warn(
                    "Unable to read anchor block timestamp:",
                    timestampError.message
                );
            }


            // =================================================
            // RETURN
            // =================================================

            return res.status(200).json({

                success: true,

                proof: {

                    merkleRoot:
                        merkleRoot,

                    ipfsCID:
                        ipfsCID,

                    timestamp:
                        timestamp !== null
                            ? timestamp.toString()
                            : null,

                    uploadedBy:
                        uploadedBy,

                    blockNumber:
                        latestEvent.blockNumber,

                    transactionHash:
                        latestEvent.transactionHash
                }

            });

        } catch (error) {

            console.error(
                "Latest blockchain proof error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve the latest anchored proof.",

                error:
                    error.message
            });
        }
    };


// =====================================================
// GET CANDIDATE + MODULE PROOF CONTEXT
// =====================================================
//
// GET /proof/record/:candidateId/:moduleCode
//
// Used by Component 4 to discover which anchored Merkle
// Root and IPFS CID contain the requested candidate/module.
//
// =====================================================

exports.getRecordProofContext =
    async (req, res) => {

        try {

            const {
                candidateId,
                moduleCode
            } = req.params;


            // =================================================
            // VALIDATE REQUEST
            // =================================================

            if (
                !candidateId ||
                !moduleCode
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Candidate ID and module code are required."
                });
            }


            const normalizedCandidateId =
                candidateId.trim();

            const normalizedModuleCode =
                moduleCode.trim();


            // =================================================
            // QUERY LATEST INDEX ENTRY
            // =================================================

            const indexEntry =
                await ResultProofIndex
                    .findOne({

                        candidateId:
                            normalizedCandidateId,

                        moduleCode:
                            normalizedModuleCode

                    })
                    .sort({

                        anchoredAt:
                            -1

                    })
                    .lean();


            // =================================================
            // NOT FOUND
            // =================================================

            if (
                !indexEntry
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "No anchored proof index found for this candidate and module.",

                    candidateId:
                        normalizedCandidateId,

                    moduleCode:
                        normalizedModuleCode
                });
            }


            // =================================================
            // RETURN LOOKUP RESULT
            // =================================================

            return res.status(200).json({

                success: true,

                record: {

                    candidateId:
                        indexEntry.candidateId,

                    moduleCode:
                        indexEntry.moduleCode,

                    merkleRoot:
                        indexEntry.merkleRoot,

                    ipfsCID:
                        indexEntry.ipfsCID,

                    anchoredAt:
                        indexEntry.anchoredAt
                }

            });

        } catch (error) {

            console.error(
                "Proof index lookup error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve the anchored proof lookup.",

                error:
                    error.message
            });
        }
    };


// =====================================================
// READ ANCHORED PROOF BY ROOT
// =====================================================
//
// GET /proof/:merkleRoot
//
// =====================================================

exports.getAnchoredProof =
    async (req, res) => {

        try {

            let {
                merkleRoot
            } = req.params;


            if (
                !merkleRoot.startsWith("0x")
            ) {

                merkleRoot =
                    `0x${merkleRoot}`;
            }


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


            const provider =
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


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


            const ipfsCID =
                proof[0];

            const timestamp =
                proof[1];

            const uploadedBy =
                proof[2];


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
// =====================================================
//
// GET /proof/:merkleRoot/data
//
// =====================================================

exports.getProofData =
    async (req, res) => {

        try {

            let {
                merkleRoot
            } = req.params;


            if (
                !merkleRoot.startsWith("0x")
            ) {

                merkleRoot =
                    `0x${merkleRoot}`;
            }


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


            const provider =
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


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


            const ipfsCID =
                proof[0];

            const timestamp =
                proof[1];

            const uploadedBy =
                proof[2];


            // =================================================
            // RETRIEVE IPFS DATA
            // =================================================

            const ipfsData =
                await getFromIPFS(
                    ipfsCID
                );


            // =================================================
            // VALIDATE IPFS STRUCTURE
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


            let normalizedIPFSRoot =
                ipfsData.merkleRoot;


            if (
                !normalizedIPFSRoot.startsWith(
                    "0x"
                )
            ) {

                normalizedIPFSRoot =
                    `0x${normalizedIPFSRoot}`;
            }


            // =================================================
            // VERIFY BLOCKCHAIN ROOT == IPFS ROOT
            // =================================================

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
            // VALIDATE FINALIZED RECORD ARRAY
            // =================================================

            if (
                !Array.isArray(
                    ipfsData.recordsWithHashes
                )
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "IPFS dataset does not contain a valid finalized record list."
                });
            }


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

                data:
                    ipfsData
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


// =====================================================
// GET STUDENT MERKLE PROOF
// =====================================================
//
// POST /proof/merkle-proof
//
// =====================================================

exports.getStudentMerkleProof =
    async (req, res) => {

        try {

            const {
                merkleRoot,
                candidateId,
                moduleCode
            } = req.body;


            if (
                !merkleRoot ||
                !candidateId ||
                !moduleCode
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "merkleRoot, candidateId and moduleCode are required."
                });
            }


            let formattedMerkleRoot =
                merkleRoot;


            if (
                !formattedMerkleRoot.startsWith(
                    "0x"
                )
            ) {

                formattedMerkleRoot =
                    `0x${formattedMerkleRoot}`;
            }


            if (
                !/^0x[a-fA-F0-9]{64}$/.test(
                    formattedMerkleRoot
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid Merkle Root format."
                });
            }


            console.log(
                "Generating student Merkle proof..."
            );


            console.log(
                "Candidate ID:",
                candidateId
            );


            console.log(
                "Module Code:",
                moduleCode
            );


            console.log(
                "Merkle Root:",
                formattedMerkleRoot
            );


            const provider =
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );


            // =================================================
            // GET CID FROM BLOCKCHAIN
            // =================================================

            const blockchainProof =
                await proofStorageContract.getProof(
                    formattedMerkleRoot
                );


            const ipfsCID =
                blockchainProof[0];


            // =================================================
            // GET FINALIZED DATA FROM IPFS
            // =================================================

            const ipfsData =
                await getFromIPFS(
                    ipfsCID
                );


            if (
                !ipfsData ||
                !Array.isArray(
                    ipfsData.recordsWithHashes
                )
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "IPFS dataset does not contain valid finalized records."
                });
            }


            // =================================================
            // VERIFY IPFS ROOT == BLOCKCHAIN ROOT
            // =================================================

            let ipfsRoot =
                ipfsData.merkleRoot;


            if (
                !ipfsRoot.startsWith("0x")
            ) {

                ipfsRoot =
                    `0x${ipfsRoot}`;
            }


            if (
                ipfsRoot.toLowerCase() !==
                formattedMerkleRoot.toLowerCase()
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "IPFS Merkle Root does not match blockchain Merkle Root.",

                    blockchainMerkleRoot:
                        formattedMerkleRoot,

                    ipfsMerkleRoot:
                        ipfsRoot
                });
            }


            // =================================================
            // FIND TARGET RECORD
            // =================================================

            const recordIndex =
                ipfsData.recordsWithHashes.findIndex(
                    (record) =>
                        record.candidateId ===
                            candidateId &&
                        record.moduleCode ===
                            moduleCode
                );


            if (
                recordIndex === -1
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student/module record not found in finalized dataset.",

                    candidateId,

                    moduleCode
                });
            }


            // =================================================
            // EXTRACT LEAF HASHES
            // =================================================

            const leafHashes =
                ipfsData.recordsWithHashes.map(
                    (record) =>
                        record.hash
                );


            // =================================================
            // BUILD PROOF
            // =================================================

            const proof =
                getMerkleProof(
                    leafHashes,
                    recordIndex
                );


            const targetRecord =
                ipfsData.recordsWithHashes[
                    recordIndex
                ];


            // =================================================
            // VERIFY PROOF
            // =================================================

            const proofIsValid =
                verifyMerkleProof(
                    targetRecord.hash,
                    proof,
                    ipfsData.merkleRoot
                );


            if (
                !proofIsValid
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Generated Merkle proof could not be verified against the official Merkle Root."
                });
            }


            // =================================================
            // RETURN PROOF
            // =================================================

            return res.status(200).json({

                success: true,

                merkleRoot:
                    formattedMerkleRoot,

                ipfsCID:
                    ipfsCID,

                record: {

                    candidateId:
                        targetRecord.candidateId,

                    moduleCode:
                        targetRecord.moduleCode,

                    marks:
                        targetRecord.marks,

                    grade:
                        targetRecord.grade,

                    version:
                        targetRecord.version,

                    hash:
                        targetRecord.hash
                },

                leafIndex:
                    recordIndex,

                proof:
                    proof,

                proofVerified:
                    true
            });

        } catch (error) {

            console.error(
                "Student Merkle proof error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to generate Merkle proof.",

                error:
                    error.message
            });
        }
    };