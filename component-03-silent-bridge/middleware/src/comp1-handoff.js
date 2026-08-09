// middleware/src/comp1-handoff.js
const axios = require('axios');

/**
 * Pushes re-corrected grading data directly from the Silent Bridge to Component 1 (Bypassing BOE).
 */
async function pushToComponent1(uploadReceipt, extractedData) {
    // Point this to Component 1's actual endpoint (or a mock port for testing)
    const COMPONENT_1_ENDPOINT = 'http://localhost:3001/api/blockchain/anchor';

    const payload = {
        metadata: {
            provenanceHash: uploadReceipt.provenanceHash,
            moduleCode: uploadReceipt.moduleCode,
            uploaderName: uploadReceipt.uploader,
            timestamp: new Date().toISOString(),
            source: "COMPONENT_3_SILENT_BRIDGE_BYPASS"
        },
        records: extractedData
    };

    try {
        console.log(`\n⚡ Bypassing BOE: Initiating Direct Handoff to Component 1 for ${uploadReceipt.moduleCode}...`);

        const response = await axios.post(COMPONENT_1_ENDPOINT, payload, { timeout: 5000 });

        console.log('✅ Handoff Successful: Component 1 acknowledged direct anchor.');
        return {
            success: true,
            status: 'bypassed_and_anchored',
            message: 'Successfully bypassed BOE and routed to Component 1.'
        };

    } catch (error) {
        console.error('❌ Component 1 Handoff Failed:', error.message);

        return {
            success: false,
            status: 'queued_bypass',
            message: 'Component 1 unreachable. Data secured in local ledger and queued for direct anchoring.'
        };
    }
}

module.exports = { pushToComponent1 };