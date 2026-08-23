require("dotenv").config();

const express = require("express");
const path = require("path");
const proofRoutes = require("./routes/proofRoutes");

const app = express();

// Middleware to parse incoming JSON payloads
app.use(express.json());

// Serve static frontend assets from the public directory (handles both simple "public" and path tracking)
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "public")));

// Mount the Component 1 API endpoint routes directly to the root "/" path 
// This keeps your endpoint exactly as: POST /generate-proof
app.use("/", proofRoutes);

// Fallback error handling for uncaught exceptions across routes
app.use((err, req, res, next) => {
    console.error("Unhandled Application Error:", err.stack);
    res.status(500).json({ success: false, error: err.message || "Something went wrong internally." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Component 1 Development Server active on http://localhost:${PORT}`);
});