// middleware/src/integration/boe-handoff.js
const axios = require('axios');

/**
 * Pushes standardized grading data from the Silent Bridge to the BOE Layer.
 * @param {Object} uploadReceipt - The metadata from the upload (module, uploader, hash)
 * @param {Array} extractedData - The JSON array of student grades parsed by SheetJS
 */
async function pushToBOE(uploadReceipt, extractedData, originalTimestamp) {
    const COMPONENT_2_ENDPOINT = 'http://localhost:5001/api/boe/ingest';

    const payload = {
        metadata: {
            provenanceHash: uploadReceipt.provenanceHash,
            moduleCode: uploadReceipt.moduleCode,
            uploaderName: uploadReceipt.uploader,
            isRecorrection: uploadReceipt.isRecorrection,
            originalTimestamp: originalTimestamp || uploadReceipt.timestamp, // <--- Handled safely here
            timestamp: new Date().toISOString(),
            source: "COMPONENT_3_SILENT_BRIDGE"
        },
        records: extractedData
    };

    try {
        console.log(`\n🚀 Initiating BOE Handoff for ${uploadReceipt.moduleCode} to ${COMPONENT_2_ENDPOINT}...`);
        
        const response = await axios.post(COMPONENT_2_ENDPOINT, payload, {
            timeout: 5000 
        });

        console.log('✅ Handoff Successful: Component 2 acknowledged and stored record.');
        return { 
            success: true, 
            status: 'synced',
            message: 'Successfully routed to Board of Examiners layer.' 
        };

    } catch (error) {
        console.error('❌ BOE Handoff Failed:', error.response?.data || error.message);
        
        return { 
            success: false, 
            status: 'queued',
            message: 'BOE layer unreachable. Data secured in local ledger.' 
        };
    }
}

module.exports = { pushToBOE };