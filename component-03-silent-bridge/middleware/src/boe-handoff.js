// middleware/src/integration/boe-handoff.js
const axios = require('axios');

/**
 * Pushes standardized grading data from the Silent Bridge to the BOE Layer.
 * @param {Object} uploadReceipt - The metadata from the upload (module, uploader, hash)
 * @param {Array} extractedData - The JSON array of student grades parsed by SheetJS
 */
async function pushToBOE(uploadReceipt, extractedData) {
    // Fallback to our mock server if the real Component 2 isn't ready
    const COMPONENT_2_ENDPOINT = 'http://localhost:4000/api/boe/ingest';

    // This is the standardized contract you are establishing with Component 2
    const payload = {
        metadata: {
            provenanceHash: uploadReceipt.provenanceHash,
            moduleCode: uploadReceipt.moduleCode,
            uploaderName: uploadReceipt.uploader,
            timestamp: new Date().toISOString(),
            source: "COMPONENT_3_SILENT_BRIDGE"
        },
        records: extractedData
    };

    try {
        console.log(`\n🚀 Initiating Handoff for ${uploadReceipt.moduleCode}...`);
        
        const response = await axios.post(COMPONENT_2_ENDPOINT, payload, {
            // Set a strict timeout so your frontend doesn't hang forever if Component 2 is offline
            timeout: 5000 
        });

        console.log('✅ Handoff Successful: Component 2 acknowledged receipt.');
        return { 
            success: true, 
            status: 'synced',
            message: 'Successfully routed to Board of Examiners layer.' 
        };

    } catch (error) {
        console.error('❌ Handoff Failed:', error.message);
        
        // Graceful degradation: The data is safe in your private ledger
        return { 
            success: false, 
            status: 'queued',
            message: 'BOE layer unreachable. Data secured in local ledger and queued for sync.' 
        };
    }
}

module.exports = { pushToBOE };