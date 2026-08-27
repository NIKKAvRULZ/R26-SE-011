// middleware/src/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import custom middleware engines, models & handoffs
const { parseExcelToJson } = require('./extraction/parser');
const { appendToPrivateBlockchain } = require('./hashing/blockchain');
const { pushToBOE } = require('./boe-handoff');
const { pushToBOEDirect } = require('./boe-direct-handoff'); 
const Block = require('./models/Block');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const configPath = path.join(__dirname, '../system-config.json');

// ============================================================================
// MONGODB CONNECTION FOR CLOUD PERSISTENCE
// ============================================================================
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI)
.then(() => console.log("✅ Silent Bridge Middleware connected to MongoDB Atlas."))
.catch(err => console.error("❌ MongoDB connection error:", err));

// --- HELPER: Read Dynamic University Policy ---
const getPolicyConfig = () => {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath));
    }
    return { timeUnit: "days", standardUploadWindow: 7, boeReviewWindow: 14, specialConcernsWindow: 21 };
};

// --- HELPER: Calculate Time Passed ---
const getTimePassed = (startDate, endDate, unit) => {
    const diffMs = Math.abs(endDate - startDate);
    if (unit === 'minutes') {
        return Math.floor(diffMs / (1000 * 60));
    }
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// ============================================================================
// INGESTION ROUTE (The Silent Bridge)
// ============================================================================
app.post('/api/ingest', upload.single('gradingSheet'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const moduleCode = (req.body.moduleCode || "UNKNOWN_MODULE").toUpperCase();
        const uploaderName = req.body.uploader || "UNKNOWN_UPLOADER";
        const isRecorrection = req.body.isRecorrection === 'true';

        console.log(`\n📥 1. Received file: ${req.file.originalname} for Module: ${moduleCode}`);
        console.log(`⏳ 2. Checking Institutional Time-Gate Policy against MongoDB Ledger...`);
        
        const policy = getPolicyConfig();
        const ledger = await Block.find().sort({ index: 1 });
        const firstUploadForModule = ledger.find(block => block.moduleCode === moduleCode);

        if (firstUploadForModule) {
            const firstUploadDate = new Date(firstUploadForModule.timestamp);
            const currentDate = new Date();
            const timePassed = getTimePassed(firstUploadDate, currentDate, policy.timeUnit);

            console.log(`   ➔ Module ${moduleCode} was first uploaded ${timePassed} ${policy.timeUnit} ago.`);

            const stdWindow = Number(policy.standardUploadWindow);
            const boeWindow = Number(policy.boeReviewWindow);
            const specialWindow = Number(policy.specialConcernsWindow);

            if (timePassed < stdWindow) {
                if (isRecorrection) {
                    return res.status(403).json({ error: `Special Concerns window is closed. Only standard uploads allowed in the first ${stdWindow} ${policy.timeUnit}.` });
                }
            } else if (timePassed >= stdWindow && timePassed < boeWindow) {
                console.log(`🛑 Upload rejected. BOE Review phase is active.`);
                return res.status(403).json({ error: `Uploads locked. Board of Examiners (BOE) review is currently in progress.` });
            } else if (timePassed >= boeWindow && timePassed < specialWindow) {
                if (!isRecorrection) {
                    console.log(`🛑 Standard upload rejected. Only Special Concerns allowed.`);
                    return res.status(403).json({ error: `Standard uploads locked. Only Special Concerns (Re-corrections) are allowed.` });
                }
            } else {
                console.log(`🛑 Upload rejected. Module is permanently finalized.`);
                return res.status(403).json({ error: `All upload windows for this module are permanently closed.` });
            }
        } else {
            if (isRecorrection) {
                return res.status(400).json({ error: 'Cannot submit a Special Concern for a module that has no initial standard upload.' });
            }
            console.log(`   ➔ First time upload for ${moduleCode}. Initializing Phase 1.`);
        }

        // --- STAGE 2: EXTRACTION ---
        console.log(`⚙️  3. Extracting and standardizing schema...`);
        const standardizedJson = parseExcelToJson(req.file.buffer);

        // --- STAGE 3: PRIVATE BLOCKCHAIN ANCHORING ---
        console.log(`🔒 4. Sealing into MongoDB Private Blockchain Ledger...`);
        const ledgerReceipt = await appendToPrivateBlockchain(standardizedJson, moduleCode, uploaderName, isRecorrection);

        if (ledgerReceipt.status === 'duplicate') {
            console.log(`🛑 Duplicate Payload Detected. Skipped saving.`);
            return res.status(200).json({
                message: 'Data already securely anchored in the Private Ledger. No changes detected.',
                fileName: req.file.originalname,
                moduleCode: moduleCode,
                status: 'duplicate'
            });
        }

        console.log(`✅ Success! Block Hash: ${ledgerReceipt.blockHash}`);

        // --- STAGE 4: CONTEXT-AWARE ROUTING ---
        const uploadMetadata = {
            provenanceHash: ledgerReceipt.blockHash,
            moduleCode: moduleCode,
            uploader: uploaderName,
            isRecorrection: isRecorrection
        };

        let syncResponseMsg = '';
        let syncStatusVal = 'held-locally';

        if (isRecorrection) {
            console.log(`⚠️ Context Routing: Special Concern flagged. Routing directly to Component 2...`);
            const handoffResult = await pushToBOEDirect(uploadMetadata, standardizedJson);
            
            if (handoffResult.success || handoffResult.status === 'bypassed_boe' || handoffResult.status === 'queued_bypass') {
                await Block.updateOne(
                    { blockHash: ledgerReceipt.blockHash },
                    { $set: { handedOffToBOE: true } }
                );
            }

            syncResponseMsg = handoffResult.message;
            syncStatusVal = handoffResult.status;
        } else {
            console.log(`🔒 Data stored securely in MongoDB ledger. Awaiting BOE window lock for auto-handoff.`);
            syncResponseMsg = 'Data sealed in ledger. Handoff deferred until BOE Review window threshold.';
            syncStatusVal = 'held-locally';
        }

        res.status(200).json({
            message: 'Data securely anchored in MongoDB ledger.',
            fileName: req.file.originalname,
            moduleCode: moduleCode,
            recordCount: standardizedJson.length,
            provenanceHash: ledgerReceipt.blockHash,
            status: 'new',
            syncStatus: syncStatusVal,
            syncMessage: syncResponseMsg
        });

    } catch (error) {
        console.error('❌ Ingestion Error:', error);
        res.status(500).json({ error: 'Internal Server Error during ingestion' });
    }
});

// ============================================================================
// UNOFFICIAL RESULTS API
// ============================================================================
app.get('/api/verify/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId.toUpperCase();
        console.log(`\n🔍 Unofficial Results Query received for Candidate: ${studentId}`);

        const ledger = await Block.find().sort({ index: 1 });
        let latestRecordsMap = {};

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
// MODULE STATUS API
// ============================================================================
app.get('/api/module-status/:moduleCode', async (req, res) => {
    try {
        const targetModule = req.params.moduleCode.toUpperCase();
        const ledger = await Block.find().sort({ index: 1 });
        const firstUpload = ledger.find(block => block.moduleCode === targetModule);
        
        if (!firstUpload) {
            return res.status(200).json({ isNew: true });
        }

        const policy = getPolicyConfig();
        const firstUploadDate = new Date(firstUpload.timestamp);
        const currentDate = new Date();
        const timePassed = getTimePassed(firstUploadDate, currentDate, policy.timeUnit);

        const stdWindow = Number(policy.standardUploadWindow);
        const boeWindow = Number(policy.boeReviewWindow);

        // Lazy evaluation: Triggers handoff precisely when the status route is polled after the window closes
        if (timePassed >= stdWindow && timePassed < boeWindow) {
            const latestBlock = ledger.filter(b => b.moduleCode === targetModule).pop();
            
            if (latestBlock && !latestBlock.handedOffToBOE) {
                console.log(`\n🚀 [Lazy-Handoff Trigger] Module ${targetModule} crossed Standard Window threshold. Pushing to BOE...`);
                
                await Block.updateOne({ blockHash: latestBlock.blockHash }, { $set: { handedOffToBOE: true } });

                try {
                    await pushToBOE({
                        provenanceHash: latestBlock.blockHash,
                        moduleCode: targetModule,
                        uploader: latestBlock.uploader,
                        isRecorrection: false
                    }, latestBlock.data, firstUpload.timestamp);

                    console.log(`✅ Automatic BOE Handoff successful for module ${targetModule}!`);
                } catch (handoffErr) {
                    console.log(`ℹ️ Component 2 processed or skipped records as duplicates for module ${targetModule}. State synced.`);
                }
            }
        }

        res.status(200).json({ 
            isNew: false, 
            firstUploadTime: firstUpload.timestamp,
            timePassed: timePassed,
            currentPhase: timePassed < stdWindow ? 'Standard' : (timePassed < boeWindow ? 'BOE' : 'Appeals')
        });

    } catch (error) {
        console.error("Module Status Error:", error);
        res.status(500).json({ error: "Failed to fetch module status" });
    }
});

// ============================================================================
// ADMIN POLICY API
// ============================================================================
app.get('/api/policy', (req, res) => {
    res.json(getPolicyConfig());
});

app.post('/api/policy', (req, res) => {
    try {
        const newPolicy = req.body;
        fs.writeFileSync(configPath, JSON.stringify(newPolicy, null, 2));
        console.log(`\n⚙️ Admin updated system policy:`, newPolicy);
        res.status(200).json({ success: true, message: "System policy updated successfully!" });
    } catch (error) {
        console.error("Failed to update policy:", error);
        res.status(500).json({ error: "Failed to update configuration." });
    }
});

// ============================================================================
// DEMO RESET UTILITY (For presentation cleanup)
// ============================================================================
app.post('/api/demo/reset-ledger', async (req, res) => {
    try {
        await Block.collection.drop();
        console.log("⚠️ [DEMO UTILITY] MongoDB ledger collection wiped clean for presentation reset.");
        res.status(200).json({ success: true, message: "Ledger collection successfully reset." });
    } catch (error) {
        res.status(200).json({ success: true, message: "Ledger is already empty." });
    }
});

// ============================================================================
// AUTOMATIC BACKGROUND DEFERRED HANDOFF WATCHER
// ============================================================================
setInterval(async () => {
    try {
        const ledger = await Block.find().sort({ index: 1 });
        if (ledger.length === 0) return;

        const policy = getPolicyConfig();
        const stdWindow = Number(policy.standardUploadWindow);
        const boeWindow = Number(policy.boeReviewWindow);
        const currentDate = new Date();

        const modules = [...new Set(ledger.map(b => b.moduleCode))];

        for (const targetModule of modules) {
            const latestBlock = ledger.filter(b => b.moduleCode === targetModule).pop();
            
            if (!latestBlock || latestBlock.handedOffToBOE) continue;

            const firstUpload = ledger.find(b => b.moduleCode === targetModule);
            if (!firstUpload) continue;

            const timePassed = getTimePassed(new Date(firstUpload.timestamp), currentDate, policy.timeUnit);

            if (timePassed >= stdWindow && timePassed < boeWindow) {
                console.log(`\n🚀 [Auto-Handoff Trigger] Module ${targetModule} crossed Standard Window. Pushing to BOE...`);
                
                // Lock database flag immediately to prevent multi-tick concurrency
                await Block.updateOne(
                    { blockHash: latestBlock.blockHash }, 
                    { $set: { handedOffToBOE: true } }
                ).catch((dbErr) => {
                    console.log(`⚠️ DB Lock Warning:`, dbErr.message);
                });

                try {
                    await pushToBOE({
                        provenanceHash: latestBlock.blockHash,
                        moduleCode: targetModule,
                        uploader: latestBlock.uploader,
                        isRecorrection: false
                    }, latestBlock.data, firstUpload.timestamp);

                    console.log(`✅ Automatic BOE Handoff successfully completed for module ${targetModule}!`);

                } catch (handoffErr) {
                    // Catch network/Component 2 errors cleanly without referencing 'next'
                    console.log(`ℹ️ Component 2 sync handled for module ${targetModule}: ${handoffErr.message}`);
                }
            }
        }
    } catch (err) {
        // Prevent background crash if 'next' was accidentally scoped anywhere here
        console.error("Background Watcher Error:", err.message);
    }
}, 5000);

// ============================================================================
// SERVER LISTENER
// ============================================================================
app.listen(port, () => {
    console.log(`🚀 Silent Bridge Middleware running on http://localhost:${port}`);
});