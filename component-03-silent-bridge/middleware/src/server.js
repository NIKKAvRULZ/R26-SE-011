const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Import our custom middleware engines
const { parseExcelToJson } = require('./extraction/parser');
const { appendToPrivateBlockchain } = require('./hashing/blockchain'); // 🚨 NEW: The Blockchain Engine
const { pushToBOE } = require('./boe-handoff');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const ledgerPath = path.join(__dirname, '../../private_ledger/database.json');

app.post('/api/ingest', upload.single('gradingSheet'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        console.log(`\n📥 1. Received file: ${req.file.originalname}`);

        // --- STAGE 1: EXTRACTION ---
        console.log(`⚙️  2. Extracting and standardizing schema...`);
        const standardizedJson = parseExcelToJson(req.file.buffer);

        // Grab metadata sent from React (Including the new Context Routing flag)
        const moduleCode = req.body.moduleCode || "UNKNOWN_MODULE";
        const uploaderName = req.body.uploader || "UNKNOWN_UPLOADER";
        const isRecorrection = req.body.isRecorrection === 'true'; // Convert string to boolean

        if (isRecorrection) {
            console.log(`⚠️ Context Routing: Upload flagged as a formal Re-correction/Appeal.`);
        }

        // --- STAGE 2: PRIVATE BLOCKCHAIN ANCHORING ---
        console.log(`🔒 3. Sealing into Private Blockchain Ledger...`);
        const ledgerReceipt = appendToPrivateBlockchain(standardizedJson, moduleCode, uploaderName, isRecorrection);

        if (ledgerReceipt.status === 'duplicate') {
            console.log(`🛑 Duplicate Payload Detected. Hash already exists in ledger. Skipped saving.`);
            return res.status(200).json({
                message: 'Data already securely anchored in the Private Ledger.',
                fileName: req.file.originalname,
                moduleCode: moduleCode,
                uploader: uploaderName,
                provenanceHash: ledgerReceipt.blockHash,
                status: 'duplicate'
            });
        }

        console.log(`✅ Success! Block Hash: ${ledgerReceipt.blockHash}`);
        console.log(`🔗 Cryptographically linked to Previous Hash: ${ledgerReceipt.previousHash}`);

        // --- STAGE 3: OUTBOUND API PIPELINE (Handoff to BOE) ---
        // We package the exact receipt data to send to Dilki's BOE layer
        const uploadMetadata = {
            provenanceHash: ledgerReceipt.blockHash,
            moduleCode: moduleCode.toUpperCase(),
            uploader: uploaderName,
            isRecorrection: isRecorrection // Passes the flag to Component 2!
        };

        const handoffResult = await pushToBOE(uploadMetadata, standardizedJson);

        // Return final receipt to the React UI
        res.status(200).json({
            message: 'Extraction, Hashing, and Routing successful!',
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

// API route for the employer Verification Portal 
app.get('/api/verify/:studentId', (req, res) => {
    try {
        const studentId = req.params.studentId.toUpperCase();
        console.log(`\n🔍 Verification Query received for Candidate: ${studentId}`);

        const rawLedger = fs.readFileSync(ledgerPath);
        const ledger = JSON.parse(rawLedger);

        // Use an object to store only the LATEST record per module
        let latestRecordsMap = {};

        ledger.forEach(block => {
            const studentRecord = block.data.find(row => row.candidateId.toUpperCase() === studentId);
            if (studentRecord) {
                // Because the ledger is chronological, this will naturally overwrite 
                // older grades with the newer re-corrected grades for the same module!
                latestRecordsMap[block.moduleCode] = {
                    moduleCode: block.moduleCode || "UNKNOWN_MODULE",
                    uploader: block.uploader || "System",
                    gradingData: studentRecord.gradingData,
                    provenanceHash: block.blockHash,
                    sealedAt: block.timestamp,
                    isRecorrection: block.isRecorrection // Pass the flag to the UI
                };
            }
        });

        // Convert the map back into an array for the frontend
        const foundRecords = Object.values(latestRecordsMap);

        if (foundRecords.length > 0) {
            console.log(`✅ Found ${foundRecords.length} verified final state records for ${studentId}`);
            res.status(200).json({ success: true, records: foundRecords });
        } else {
            console.log(`❌ No records found for ${studentId}`);
            res.status(404).json({ success: false, message: "No cryptographic records found." });
        }

    } catch (error) {
        console.error('Search Error:', error);
        res.status(500).json({ error: 'Internal Server Error during verification' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Silent Bridge Middleware running on http://localhost:${port}`);
});