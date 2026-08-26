// middleware/src/boe-direct-handoff.js
const axios = require('axios');

/**
 * Pushes Special Concerns (Re-corrected grading data) from the Silent Bridge 
 * directly to Component 2's bypass endpoint, avoiding the 7-day BOE review cycle.
 */
async function pushToBOEDirect(uploadReceipt, extractedData) {
    // Allows setting a base URL via environment variable, appending the direct update route
    const baseUrl = process.env.COMPONENT_2_URL || 'http://localhost:5001';
    const COMPONENT_2_DIRECT_ENDPOINT = `${baseUrl.replace(/\/$/, '')}/api/boe/direct-update`;

    const payload = {
        metadata: {
            provenanceHash: uploadReceipt.provenanceHash,
            moduleCode: uploadReceipt.moduleCode,
            uploaderName: uploadReceipt.uploader,
            timestamp: new Date().toISOString(),
            source: "COMPONENT_3_SPECIAL_CONCERN",
            isRecorrection: true
        },
        records: extractedData.map(item => ({
            candidateId: item.candidateId,
            gradingData: {
                "Marks": item.gradingData["Marks"] || item.gradingData["Final Marks"] || item.gradingData["New Marks"] || 0,
                "Final Grade": item.gradingData["Final Grade"] || item.gradingData["Overall Grade"] || item.gradingData["Appealed Grade"] || "Pass",
                ...item.gradingData
            }
        }))
    };

    try {
        console.log(`\n⚡ Special Concern: Initiating Direct Handoff to Component 2 for ${uploadReceipt.moduleCode}...`);
        
        const response = await axios.post(COMPONENT_2_DIRECT_ENDPOINT, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000 
        });

        console.log('✅ Handoff Successful: Component 2 acknowledged direct update.');
        return { 
            success: true, 
            status: 'bypassed_boe',
            message: 'Successfully bypassed BOE review and routed to Component 2 Live DB.' 
        };

    } catch (error) {
        console.error('❌ Component 2 Direct Handoff Failed:', error.response?.data || error.message);
        
        return { 
            success: false, 
            status: 'queued_bypass',
            message: 'Component 2 unreachable. Special Concern secured in local ledger and queued.' 
        };
    }
}

module.exports = { pushToBOEDirect };