// middleware/mock-server.js
const express = require('express');
const cors = require('cors');

const app = express();
const port = 4000; // Component 2 runs on port 4000

app.use(cors());
app.use(express.json());

// --- MOCK ENDPOINT 1: Standard BOE Ingestion (Days 1-7) ---
app.post('/api/boe/ingest', (req, res) => {
    const moduleCode = req.body.metadata?.moduleCode || "UNKNOWN";
    const recordCount = req.body.records?.length || 0;

    console.log(`\n📥 [MOCK COMP 2] STANDARD UPLOAD RECEIVED`);
    console.log(`   ➔ Module: ${moduleCode}`);
    console.log(`   ➔ Records: ${recordCount}`);
    console.log(`   ➔ Status: Saved to Mock BOE MongoDB for 7-Day Review`);
    
    res.status(200).json({ 
        success: true, 
        message: "Mock BOE Layer successfully ingested standard grades." 
    });
});

// --- MOCK ENDPOINT 2: Direct Bypass / Special Concerns (Days 15-21) ---
app.post('/api/boe/direct-update', (req, res) => {
    const moduleCode = req.body.metadata?.moduleCode || "UNKNOWN";
    const recordCount = req.body.records?.length || 0;

    console.log(`\n🚨 [MOCK COMP 2] SPECIAL CONCERN (BYPASS) RECEIVED`);
    console.log(`   ➔ Module: ${moduleCode}`);
    console.log(`   ➔ Records: ${recordCount}`);
    console.log(`   ➔ Status: BOE Review Bypassed. Saved directly to Live DB.`);
    
    res.status(200).json({ 
        success: true, 
        message: "Mock Component 2 successfully processed direct Special Concern update." 
    });
});

app.listen(port, () => {
    console.log(`🟢 Mock Component 2 Server running on http://localhost:${port}`);
    console.log(`   Listening for Standard Uploads on /api/boe/ingest`);
    console.log(`   Listening for Special Concerns on /api/boe/direct-update`);
});