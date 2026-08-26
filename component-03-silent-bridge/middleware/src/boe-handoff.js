// middleware/src/boe-handoff.js
const axios = require('axios');

async function pushToBOE(uploadReceipt, extractedData, originalTimestamp) {
    const COMPONENT_2_ENDPOINT = 'http://localhost:5001/api/boe/ingest';

    const payload = {
        metadata: {
            provenanceHash: uploadReceipt.provenanceHash,
            moduleCode: uploadReceipt.moduleCode,
            uploaderName: uploadReceipt.uploader,
            isRecorrection: false,
            originalTimestamp: originalTimestamp || uploadReceipt.timestamp,
            timestamp: new Date().toISOString(),
            source: "COMPONENT_3_SILENT_BRIDGE"
        },
        records: extractedData.map(item => ({
            candidateId: item.candidateId,
            gradingData: {
                "Marks": item.gradingData["Marks"] || item.gradingData["Final Marks"] || 0,
                "Final Grade": item.gradingData["Final Grade"] || item.gradingData["Overall Grade"] || "Pass",
                ...item.gradingData
            }
        }))
    };

    try {
        console.log(`\n🚀 Initiating BOE Handoff for ${uploadReceipt.moduleCode} to ${COMPONENT_2_ENDPOINT}...`);
        
        const response = await axios.post(COMPONENT_2_ENDPOINT, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000 
        });

        console.log('✅ Handoff Successful: Component 2 acknowledged and stored record.');
        return { success: true, status: 'synced', message: 'Successfully routed to Board of Examiners layer.' };

    } catch (error) {
        console.error('❌ BOE Handoff Failed:', error.response?.data || error.message);
        return { success: false, status: 'queued', message: 'BOE layer unreachable.' };
    }
}

module.exports = { pushToBOE };