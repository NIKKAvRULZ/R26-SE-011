const mongoose = require("mongoose");

async function connectProofIndexDatabase() {
    const mongoUri = process.env.PROOF_INDEX_MONGO_URI;

    if (!mongoUri) {
        throw new Error(
            "PROOF_INDEX_MONGO_URI is missing from environment variables."
        );
    }

    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 20000,
            maxPoolSize: 10,
            minPoolSize: 1
        });

        console.log("Proof Index MongoDB Connected");
    } catch (error) {
        console.error(
            "Proof Index MongoDB connection failed:",
            error.message
        );

        throw error;
    }
}

module.exports = {
    connectProofIndexDatabase
};