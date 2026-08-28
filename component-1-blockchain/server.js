require("dotenv").config();

const express = require("express");
const path = require("path");

const proofRoutes =
    require("./routes/proofRoutes");

const {
    connectProofIndexDatabase
} = require("./config/db");

const app =
    express();


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
    express.json()
);


// =====================================================
// HEALTH CHECK
// =====================================================
//
// Used by Railway to confirm that the service is alive.
// This endpoint does not depend on blockchain/IPFS/MongoDB.
//
// =====================================================

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({

            status: "ok",

            service:
                "component-1-blockchain",

            timestamp:
                new Date().toISOString()

        });
    }
);


// =====================================================
// STATIC FRONTEND
// =====================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// =====================================================
// API ROUTES
// =====================================================

app.use(
    "/",
    proofRoutes
);


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            "Unhandled Application Error:",
            err.stack
        );

        res.status(500).json({

            success: false,

            error:
                err.message ||
                "Something went wrong internally."
        });
    }
);


// =====================================================
// SERVER START
// =====================================================

const PORT =
    Number(
        process.env.PORT || 5002
    );


async function startServer() {

    try {

        // =================================================
        // VALIDATE REQUIRED CONFIGURATION
        // =================================================

        if (
            !process.env.PROOF_INDEX_MONGO_URI
        ) {

            throw new Error(
                "PROOF_INDEX_MONGO_URI is missing from environment variables."
            );
        }


        if (
            !process.env.CONTRACT_ADDRESS
        ) {

            console.warn(
                "WARNING: CONTRACT_ADDRESS is not configured. Blockchain operations will fail until it is set."
            );
        }


        // =================================================
        // CONNECT TO PROOF INDEX DATABASE
        // =================================================

        await connectProofIndexDatabase();


        // =================================================
        // START EXPRESS SERVER
        // =================================================

        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `Component 1 server listening on port ${PORT}`
                );

                console.log(
                    `Blockchain RPC: ${
                        process.env.RPC_URL ||
                        "http://127.0.0.1:8545"
                    }`
                );

                console.log(
                    `ProofStorage contract: ${
                        process.env.CONTRACT_ADDRESS ||
                        "NOT CONFIGURED"
                    }`
                );

                console.log(
                    "Proof Index database is ready."
                );
            }
        );

    } catch (error) {

        console.error(
            "Component 1 startup failed."
        );

        console.error(
            error.message
        );

        process.exit(1);
    }
}


startServer();