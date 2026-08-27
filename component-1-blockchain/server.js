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