// middleware/src/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Import custom middleware engines & handoffs
const { parseExcelToJson } = require('./extraction/parser');
const { appendToPrivateBlockchain } = require('./hashing/blockchain');
const { pushToBOE } = require('./boe-handoff');
const { pushToBOEDirect } = require('./boe-direct-handoff'); 

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const ledgerPath = path.join(__dirname, '../../private_ledger/database.json');
const configPath = path.join(__dirname, '../system-config.json');

// --- HELPER: Read Dynamic University Policy ---
const getPolicyConfig = () => {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath));
    }
    // Fallback defaults if file is missing
    return { timeUnit: "days", standardUploadWindow: 7, boeReviewWindow: 14, specialConcernsWindow: 21 };
};

// --- HELPER: Calculate Time Passed ---
const getTimePassed = (startDate, endDate, unit) => {
    const diffMs = Math.abs(endDate - startDate);
    if (unit === 'minutes') {
        return Math.floor(diffMs / (1000 * 60));
    }
    // Default to days
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// ============================================================================
// INGESTION ROUTE (The Silent Bridge)
// ============================================================================
app.post('/api/ingest', upload.single('gradingSheet'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        // Grab metadata sent from React
        const moduleCode = (req.body.moduleCode || "UNKNOWN_MODULE").toUpperCase();
        const uploaderName = req.body.uploader || "UNKNOWN_UPLOADER";
        const isRecorrection = req.body.isRecorrection === 'true';

        console.log(`\n📥 1. Received file: ${req.file.originalname} for Module: ${moduleCode}`);

        // --- STAGE 1: DYNAMIC TIME-GATE LOCKING LOGIC ---
        console.log(`⏳ 2. Checking Institutional Time-Gate Policy...`);
        
        const policy = getPolicyConfig();
        let rawLedger = "[]";
        if (fs.existsSync(ledgerPath)) {
            rawLedger = fs.readFileSync(ledgerPath);
        }
        const ledger = JSON.parse(rawLedger);

        // Find the absolute FIRST upload for this module to establish "Day 1"
        const firstUploadForModule = ledger.find(block => block.moduleCode === moduleCode);

        if (firstUploadForModule) {
            const firstUploadDate = new Date(firstUploadForModule.timestamp);
            const currentDate = new Date();
            const timePassed = getTimePassed(firstUploadDate, currentDate, policy.timeUnit);

            console.log(`   ➔ Module ${moduleCode} was first uploaded ${timePassed} ${policy.timeUnit} ago.`);

            // Phase 1: Standard Upload Window
            if (timePassed < policy.standardUploadWindow) {
                if (isRecorrection) {
                    return res.status(403).json({ error: `Special Concerns window is closed. Only standard uploads allowed in the first ${policy.standardUploadWindow} ${policy.timeUnit}.` });
                }
            } 
            // Phase 2: BOE Review Window - LOCKED
            else if (timePassed >= policy.standardUploadWindow && timePassed < policy.boeReviewWindow) {
                console.log(`🛑 Upload rejected. BOE Review phase is active.`);
                return res.status(403).json({ error: `Uploads locked. Board of Examiners (BOE) review is currently in progress (Window: ${policy.standardUploadWindow}-${policy.boeReviewWindow} ${policy.timeUnit}).` });
            } 
            // Phase 3: Special Concerns Window
            else if (timePassed >= policy.boeReviewWindow && timePassed < policy.specialConcernsWindow) {
                if (!isRecorrection) {
                    console.log(`🛑 Standard upload rejected. Only Special Concerns allowed.`);
                    return res.status(403).json({ error: `Standard uploads locked. Only Special Concerns (Re-corrections) are allowed during the appeals window (Window: ${policy.boeReviewWindow}-${policy.specialConcernsWindow} ${policy.timeUnit}).` });
                }
            } 
            // Phase 4: System Finalized - LOCKED
            else {
                console.log(`🛑 Upload rejected. Module is permanently finalized.`);
                return res.status(403).json({ error: `All upload windows for this module are permanently closed (${policy.specialConcernsWindow}+ ${policy.timeUnit}). Data is in final hashing phase.` });
            }
        } else {
            // If no previous upload exists, this is Day 1. It cannot be a Special Concern yet.
            if (isRecorrection) {
                return res.status(400).json({ error: 'Cannot submit a Special Concern for a module that has no initial standard upload.' });
            }
            console.log(`   ➔ First time upload for ${moduleCode}. Initializing Phase 1.`);
        }

        // --- STAGE 2: EXTRACTION ---
        console.log(`⚙️  3. Extracting and standardizing schema...`);
        const standardizedJson = parseExcelToJson(req.file.buffer);

        // --- STAGE 3: PRIVATE BLOCKCHAIN ANCHORING ---
        console.log(`🔒 4. Sealing into Private Blockchain Ledger...`);
        const ledgerReceipt = appendToPrivateBlockchain(standardizedJson, moduleCode, uploaderName, isRecorrection);

        if (ledgerReceipt.status === 'duplicate') {
            console.log(`🛑 Duplicate Payload Detected. Hash already exists in ledger. Skipped saving.`);
            return res.status(200).json({
                message: 'Data already securely anchored in the Private Ledger. No changes detected.',
                fileName: req.file.originalname,
                moduleCode: moduleCode,
                uploader: uploaderName,
                provenanceHash: ledgerReceipt.blockHash,
                status: 'duplicate'
            });
        }

        console.log(`✅ Success! Block Hash: ${ledgerReceipt.blockHash}`);
        console.log(`🔗 Cryptographically linked to Previous Hash: ${ledgerReceipt.previousHash}`);

        // --- STAGE 4: CONTEXT-AWARE ROUTING ---
        const uploadMetadata = {
            provenanceHash: ledgerReceipt.blockHash,
            moduleCode: moduleCode,
            uploader: uploaderName,
            isRecorrection: isRecorrection
        };

        let handoffResult;

        if (isRecorrection) {
            console.log(`⚠️ Context Routing: Special Concern flagged. Routing directly to Component 2 (Bypassing BOE review)...`);
            handoffResult = await pushToBOEDirect(uploadMetadata, standardizedJson);
        } else {
            console.log(`🚀 Standard Routing: Sending payload to Component 2 BOE Layer for review...`);
            handoffResult = await pushToBOE(uploadMetadata, standardizedJson);
        }

        // Return final receipt to the React UI
        res.status(200).json({
            message: isRecorrection ? 'Special Concern routed directly to Component 2!' : 'Standard BOE Routing successful!',
            fileName: req.file.originalname,
            moduleCode: moduleCode,
            recordCount: standardizedJson.length,
            provenanceHash: ledgerReceipt.blockHash,
            status: 'new',
            syncStatus: handoffResult.status,
            syncMessage: handoffResult.message
        });

    } catch (error) {
        console.error('❌ Ingestion Error:', error);
        res.status(500).json({ error: 'Internal Server Error during ingestion' });
    }
});

// ============================================================================
// UNOFFICIAL RESULTS API (Phase 1 Access for University Frontend)
// ============================================================================
app.get('/api/verify/:studentId', (req, res) => {
    try {
        const studentId = req.params.studentId.toUpperCase();
        console.log(`\n🔍 Unofficial Results Query received for Candidate: ${studentId}`);

        let rawLedger = "[]";
        if (fs.existsSync(ledgerPath)) {
            rawLedger = fs.readFileSync(ledgerPath);
        }
        const ledger = JSON.parse(rawLedger);

        let latestRecordsMap = {};

        // Loop through the ledger to find the most recent grades for the student
        ledger.forEach(block => {
            const studentRecord = block.data.find(row => row.candidateId.toUpperCase() === studentId);
            if (studentRecord) {
                latestRecordsMap[block.moduleCode] = {
                    moduleCode: block.moduleCode || "UNKNOWN_MODULE",
                    uploader: block.uploader || "System",
                    gradingData: studentRecord.gradingData,
                    provenanceHash: block.blockHash,
                    sealedAt: block.timestamp,
                    isRecorrection: block.isRecorrection
                };
            }
        });

        const foundRecords = Object.values(latestRecordsMap);

        if (foundRecords.length > 0) {
            console.log(`✅ Found ${foundRecords.length} unofficial state records for ${studentId}`);
            res.status(200).json({ success: true, type: "unofficial", records: foundRecords });
        } else {
            console.log(`❌ No unofficial records found for ${studentId}`);
            res.status(404).json({ success: false, message: "No cryptographic records found." });
        }

    } catch (error) {
        console.error('Search Error:', error);
        res.status(500).json({ error: 'Internal Server Error during verification' });
    }
});

// ============================================================================
// MODULE STATUS API (For Frontend Timeline Lock)
// ============================================================================
app.get('/api/module-status/:moduleCode', (req, res) => {
    try {
        const targetModule = req.params.moduleCode.toUpperCase();
        
        let rawLedger = "[]";
        if (fs.existsSync(ledgerPath)) {
            rawLedger = fs.readFileSync(ledgerPath);
        }
        const ledger = JSON.parse(rawLedger);
        
        // Find the very first time this module was uploaded
        const firstUpload = ledger.find(block => block.moduleCode === targetModule);
        
        if (firstUpload) {
            res.status(200).json({ isNew: false, firstUploadTime: firstUpload.timestamp });
        } else {
            res.status(200).json({ isNew: true });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch module status" });
    }
});

app.listen(port, () => {
    console.log(`🚀 Silent Bridge Middleware running on http://localhost:${port}`);
});

// ============================================================================
// ADMIN POLICY API (Dynamic Configuration)
// ============================================================================
app.get('/api/policy', (req, res) => {
    res.json(getPolicyConfig());
});

app.post('/api/policy', (req, res) => {
    try {
        const newPolicy = req.body;
        // Write the new policy directly to system-config.json
        fs.writeFileSync(configPath, JSON.stringify(newPolicy, null, 2));
        console.log(`\n⚙️ Admin updated system policy:`, newPolicy);
        res.status(200).json({ success: true, message: "System policy updated successfully!" });
    } catch (error) {
        console.error("Failed to update policy:", error);
        res.status(500).json({ error: "Failed to update configuration." });
    }
});