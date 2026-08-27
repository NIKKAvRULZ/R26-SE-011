// middleware/src/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

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
// MONGODB CONNECTION
// ============================================================================
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI)
.then(() => console.log("✅ Silent Bridge Middleware connected to MongoDB Atlas."))
.catch(err => console.error("❌ MongoDB connection error:", err));

const getPolicyConfig = () => {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath));
    }
    return { timeUnit: "days", standardUploadWindow: 7, boeReviewWindow: 14, specialConcernsWindow: 21 };
};

const getTimePassed = (startDate, endDate, unit) => {
    const diffMs = Math.abs(endDate - startDate);
    if (unit === 'minutes') {
        return Math.floor(diffMs / (1000 * 60));
    }
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// ============================================================================
// INGESTION ROUTE
// ============================================================================
app.post('/api/ingest', upload.single('gradingSheet'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const moduleCode = (req.body.moduleCode || "UNKNOWN_MODULE").toUpperCase();
        const uploaderName = req.body.uploader || "UNKNOWN_UPLOADER";
        const isRecorrection = req.body.isRecorrection === 'true';
        
        const policy = getPolicyConfig();
        const ledger = await Block.find().sort({ index: 1 });
        const firstUploadForModule = ledger.find(block => block.moduleCode === moduleCode);

        if (firstUploadForModule) {
            const firstUploadDate = new Date(firstUploadForModule.timestamp);
            const currentDate = new Date();
            const timePassed = getTimePassed(firstUploadDate, currentDate, policy.timeUnit);

            const stdWindow = Number(policy.standardUploadWindow);
            const boeWindow = Number(policy.boeReviewWindow);
            const specialWindow = Number(policy.specialConcernsWindow);

            if (timePassed < stdWindow) {
                if (isRecorrection) {
                    return res.status(403).json({ error: `Special Concerns window is closed.` });
                }
            } else if (timePassed >= stdWindow && timePassed < boeWindow) {
                return res.status(403).json({ error: `Uploads locked. Board of Examiners (BOE) review in progress.` });
            } else if (timePassed >= boeWindow && timePassed < specialWindow) {
                if (!isRecorrection) {
                    return res.status(403).json({ error: `Standard uploads locked. Only Special Concerns allowed.` });
                }
            } else {
                return res.status(403).json({ error: `All upload windows for this module are closed.` });
            }
        } else {
            if (isRecorrection) {
                return res.status(400).json({ error: 'Cannot submit a Special Concern without an initial standard upload.' });
            }
        }

        const standardizedJson = parseExcelToJson(req.file.buffer);
        const ledgerReceipt = await appendToPrivateBlockchain(standardizedJson, moduleCode, uploaderName, isRecorrection);

        if (ledgerReceipt.status === 'duplicate') {
            return res.status(200).json({
                message: 'Data already securely anchored in the Private Ledger.',
                moduleCode: moduleCode,
                status: 'duplicate'
            });
        }

        const uploadMetadata = {
            provenanceHash: ledgerReceipt.blockHash,
            moduleCode: moduleCode,
            uploader: uploaderName,
            isRecorrection: isRecorrection
        };

        let syncResponseMsg = '';
        let syncStatusVal = 'held-locally';

        if (isRecorrection) {
            const handoffResult = await pushToBOEDirect(uploadMetadata, standardizedJson);
            if (handoffResult.success || handoffResult.status === 'bypassed_boe' || handoffResult.status === 'queued_bypass') {
                await Block.updateOne({ blockHash: ledgerReceipt.blockHash }, { $set: { handedOffToBOE: true } });
            }
            syncResponseMsg = handoffResult.message;
            syncStatusVal = handoffResult.status;
        } else {
            syncResponseMsg = 'Data sealed in ledger. Handoff deferred until BOE Review window threshold.';
            syncStatusVal = 'held-locally';
        }

        res.status(200).json({
            message: 'Data securely anchored in MongoDB ledger.',
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
// MODULE STATUS API
// ============================================================================
app.get('/api/module-status/:moduleCode', async (req, res) => {
    try {
        const targetModule = req.params.moduleCode.toUpperCase();
        const ledger = await Block.find().sort({ index: 1 });
        const firstUpload = ledger.find(block => block.moduleCode === targetModule);
        
        if (!firstUpload) return res.status(200).json({ isNew: true });

        const policy = getPolicyConfig();
        const timePassed = getTimePassed(new Date(firstUpload.timestamp), new Date(), policy.timeUnit);
        const stdWindow = Number(policy.standardUploadWindow);
        const boeWindow = Number(policy.boeReviewWindow);

        if (timePassed >= stdWindow && timePassed < boeWindow) {
            const latestBlock = ledger.filter(b => b.moduleCode === targetModule).pop();
            if (latestBlock && !latestBlock.handedOffToBOE) {
                await Block.updateOne({ blockHash: latestBlock.blockHash }, { $set: { handedOffToBOE: true } });
                try {
                    await pushToBOE({
                        provenanceHash: latestBlock.blockHash,
                        moduleCode: targetModule,
                        uploader: latestBlock.uploader,
                        isRecorrection: false
                    }, latestBlock.data, firstUpload.timestamp);
                } catch (e) {}
            }
        }

        res.status(200).json({ isNew: false, firstUploadTime: firstUpload.timestamp, timePassed });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch module status" });
    }
});

// ============================================================================
// ADMIN POLICY API
// ============================================================================
app.get('/api/policy', (req, res) => res.json(getPolicyConfig()));
app.post('/api/policy', (req, res) => {
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.status(200).json({ success: true, message: "Policy updated!" });
});

// ============================================================================
// AUDIT TRAIL API
// ============================================================================
app.get('/api/ledger/audit-trail', async (req, res) => {
    try {
        const ledger = await Block.find().sort({ index: 1 });
        res.status(200).json({ success: true, chain: ledger });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audit trail.' });
    }
});

app.listen(port, () => console.log(`🚀 Silent Bridge Middleware running on http://localhost:${port}`));