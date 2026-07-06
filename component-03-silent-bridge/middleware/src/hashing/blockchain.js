// middleware/src/hashing/blockchain.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ledgerPath = path.join(__dirname, '../../../private_ledger/database.json');

function appendToPrivateBlockchain(standardizedJson, moduleCode, uploader, isRecorrection) {
    let ledger = [];
    if (fs.existsSync(ledgerPath)) {
        const rawLedger = fs.readFileSync(ledgerPath);
        ledger = JSON.parse(rawLedger);
    }

    // 1. Create a deterministic Payload Hash (Data + Module ONLY)
    // This ignores timestamps and previous hashes, exposing true duplicates.
    const payloadString = JSON.stringify({
        module: moduleCode.toUpperCase(),
        data: standardizedJson
    });
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    // 2. Check for duplicates (Idempotency Control)
    const duplicateBlock = ledger.find(block => block.payloadHash === payloadHash);
    if (duplicateBlock) {
        return { status: 'duplicate', blockHash: duplicateBlock.blockHash };
    }

    // 3. If it's a new payload, get the previous block's hash to maintain the chain
    const previousHash = ledger.length > 0 ? ledger[ledger.length - 1].blockHash : "0000000000000000000000000000000000000000000000000000000000000000";

    // 4. Create the new block structure
    const newBlock = {
        timestamp: new Date().toISOString(),
        moduleCode: moduleCode.toUpperCase(),
        uploader: uploader,
        isRecorrection: isRecorrection,
        recordCount: standardizedJson.length,
        payloadHash: payloadHash, // Save this inside the block for future duplicate checks
        data: standardizedJson,
        previousHash: previousHash
    };

    // 5. Generate the definitive Block Hash (sealing the data, timestamp, and previous link together)
    const blockString = JSON.stringify(newBlock);
    const blockHash = crypto.createHash('sha256').update(blockString).digest('hex');

    newBlock.blockHash = blockHash;

    // 6. Save to chain
    ledger.push(newBlock);
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

    return {
        status: 'new',
        blockHash: blockHash,
        previousHash: previousHash
    };
}

module.exports = { appendToPrivateBlockchain };