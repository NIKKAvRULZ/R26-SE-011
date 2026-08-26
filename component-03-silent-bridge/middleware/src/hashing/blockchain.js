// middleware/src/hashing/blockchain.js
const crypto = require('crypto');
const Block = require('../models/Block');

async function appendToPrivateBlockchain(standardizedJson, moduleCode, uploader, isRecorrection) {
    try {
        // 1. Fetch current ledger from MongoDB chronologically
        const ledger = await Block.find().sort({ index: 1 });

        // 2. Create a deterministic Payload Hash (Data + Module ONLY)
        const payloadString = JSON.stringify({
            module: moduleCode.toUpperCase(),
            data: standardizedJson
        });
        const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

        // 3. Check for duplicates (Idempotency Control)
        const duplicateBlock = ledger.find(block => block.payloadHash === payloadHash);
        if (duplicateBlock) {
            return { status: 'duplicate', blockHash: duplicateBlock.blockHash };
        }

        // 4. Get the previous block's hash to maintain the chain
        const lastBlock = ledger.length > 0 ? ledger[ledger.length - 1] : null;
        const previousHash = lastBlock ? lastBlock.blockHash : "0000000000000000000000000000000000000000000000000000000000000000";
        const index = lastBlock ? lastBlock.index + 1 : 0;

        // 5. Create the new block structure
        const newBlockData = {
            index: index,
            timestamp: new Date().toISOString(),
            moduleCode: moduleCode.toUpperCase(),
            uploader: uploader,
            isRecorrection: isRecorrection,
            recordCount: standardizedJson.length,
            payloadHash: payloadHash,
            data: standardizedJson,
            previousHash: previousHash,
            handedOffToBOE: false
        };

        // 6. Generate the definitive Block Hash
        const blockString = JSON.stringify(newBlockData);
        const blockHash = crypto.createHash('sha256').update(blockString).digest('hex');

        newBlockData.blockHash = blockHash;

        // 7. Save to MongoDB (Append-Only)
        const newBlock = new Block(newBlockData);
        await newBlock.save();

        return {
            status: 'new',
            blockHash: blockHash,
            previousHash: previousHash
        };
    } catch (error) {
        console.error("❌ Private Ledger Error:", error);
        throw error;
    }
}

module.exports = { appendToPrivateBlockchain };