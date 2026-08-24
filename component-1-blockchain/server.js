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
    express.static("public")
);

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
    process.env.PORT || 3000;


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
            () => {

                console.log(
                    `Component 1 Development Server active on http://localhost:${PORT}`
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