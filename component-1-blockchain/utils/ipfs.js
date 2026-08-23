require("dotenv").config();

const axios = require("axios");

const PINATA_API_KEY =
    process.env.PINATA_API_KEY;

const PINATA_SECRET_API_KEY =
    process.env.PINATA_SECRET_API_KEY;


// =====================================================
// PINATA GATEWAY
// =====================================================
//
// Your Pinata gateway:
// red-rare-goat-296.mypinata.cloud
//
// Only the domain should be stored in .env.
// =====================================================

const PINATA_GATEWAY =
    (
        process.env.IPFS_GATEWAY ||
        "red-rare-goat-296.mypinata.cloud"
    )
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");


// =====================================================
// FALLBACK GATEWAYS
// =====================================================

const IPFS_GATEWAYS = [
    `https://${PINATA_GATEWAY}/ipfs`,
    "https://gateway.pinata.cloud/ipfs",
    "https://dweb.link/ipfs",
    "https://ipfs.io/ipfs"
];


// =====================================================
// UPLOAD JSON TO IPFS USING PINATA
// =====================================================

async function uploadToIPFS(data) {
    try {

        if (
            !PINATA_API_KEY ||
            !PINATA_SECRET_API_KEY
        ) {
            throw new Error(
                "Pinata API credentials are missing from environment variables."
            );
        }


        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinJSONToIPFS",
            data,
            {
                headers: {
                    pinata_api_key:
                        PINATA_API_KEY,

                    pinata_secret_api_key:
                        PINATA_SECRET_API_KEY,

                    "Content-Type":
                        "application/json",

                    "User-Agent":
                        "Blockchain-Grading-System/1.0"
                },

                timeout: 30000
            }
        );


        if (
            !response.data ||
            !response.data.IpfsHash
        ) {
            throw new Error(
                "Pinata upload succeeded but no CID was returned."
            );
        }


        return response.data.IpfsHash;

    } catch (error) {

        console.error(
            "IPFS Upload Error:",
            error.response?.data ||
            error.message
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

    if (
        !cid ||
        typeof cid !== "string"
    ) {
        throw new Error(
            "A valid IPFS CID is required."
        );
    }


    const cleanCID =
        cid.trim();


    let failures = [];


    for (
        const gateway of IPFS_GATEWAYS
    ) {

        const gatewayUrl =
            `${gateway}/${encodeURIComponent(cleanCID)}`;


        try {

            console.log(
                `\n[IPFS] Trying gateway: ${gatewayUrl}`
            );


            const response =
                await axios.get(
                    gatewayUrl,
                    {
                        timeout: 30000,

                        maxRedirects: 5,

                        headers: {
                            Accept:
                                "application/json, text/plain, */*",

                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36"
                        },

                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 300
                    }
                );


            if (
                response.data !== undefined &&
                response.data !== null
            ) {

                console.log(
                    `[IPFS] SUCCESS: ${gatewayUrl}`
                );


                return response.data;
            }


            failures.push(
                `${gatewayUrl} -> empty response`
            );

        } catch (error) {

            const status =
                error.response?.status;

            const detail =
                status
                    ? `HTTP ${status}`
                    : error.code || error.message;


            failures.push(
                `${gatewayUrl} -> ${detail}`
            );


            console.warn(
                `[IPFS] FAILED: ${gatewayUrl} -> ${detail}`
            );
        }
    }


    throw new Error(
        "All IPFS gateways failed.\n" +
        failures.join("\n")
    );
}


module.exports = {
    uploadToIPFS,
    getFromIPFS
};