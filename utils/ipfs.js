require("dotenv").config();

const axios = require("axios");

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

// Pinata IPFS gateway
const IPFS_GATEWAY =
    process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

// =====================================================
// UPLOAD JSON TO IPFS USING PINATA
// =====================================================

async function uploadToIPFS(data) {
    try {
        if (!PINATA_API_KEY || !PINATA_SECRET_API_KEY) {
            throw new Error(
                "Pinata API credentials are missing from environment variables."
            );
        }

        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinJSONToIPFS",
            data,
            {
                headers: {
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        if (!response.data || !response.data.IpfsHash) {
            throw new Error(
                "Pinata upload succeeded but no CID was returned."
            );
        }

        return response.data.IpfsHash;

    } catch (error) {
        console.error(
            "IPFS Upload Error:",
            error.response?.data || error.message
        );

        throw new Error(
            `Failed to upload data to IPFS: ${error.message}`
        );
    }
}


// =====================================================
// GET JSON DATA FROM IPFS USING CID
// =====================================================

async function getFromIPFS(cid) {
    try {
        if (!cid || typeof cid !== "string") {
            throw new Error("A valid IPFS CID is required.");
        }

        const gatewayUrl =
            `${IPFS_GATEWAY}/${encodeURIComponent(cid)}`;

        console.log(
            "Retrieving proof data from IPFS:",
            gatewayUrl
        );

        const response = await axios.get(
            gatewayUrl,
            {
                timeout: 30000,
                headers: {
                    Accept: "application/json"
                }
            }
        );

        if (!response.data) {
            throw new Error(
                "IPFS returned an empty response."
            );
        }

        return response.data;

    } catch (error) {
        console.error(
            "IPFS Retrieval Error:",
            error.response?.data || error.message
        );

        throw new Error(
            `Failed to retrieve data from IPFS: ${error.message}`
        );
    }
}


module.exports = {
    uploadToIPFS,
    getFromIPFS
};