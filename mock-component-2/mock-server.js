// mock-server.js
const express = require('express');
const app = express();

// Middleware to parse JSON payloads
app.use(express.json());

// This is the fake endpoint your Component 3 will talk to
app.post('/api/boe/ingest', (req, res) => {
    console.log("\n========================================");
    console.log("📥 MOCK COMPONENT 2 (BOE LAYER) HIT!");
    console.log("========================================");
    
    // Print out the exact payload you sent from Component 3
    console.dir(req.body, { depth: null, colors: true });
    
    console.log("========================================\n");

    // Send a fake success response back to your Silent Bridge
    res.status(200).json({ 
        status: "success", 
        message: "Mock BOE received and acknowledged the payload." 
    });
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🛡️ Mock Component 2 is actively listening on port ${PORT}...`);
});