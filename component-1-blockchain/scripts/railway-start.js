const { spawn } = require("child_process");
const path = require("path");
const { ethers } = require("ethers");


// =====================================================
// CONFIGURATION
// =====================================================

const ROOT_DIR =
    path.join(
        __dirname,
        ".."
    );

const RPC_URL =
    process.env.RPC_URL ||
    "http://127.0.0.1:8545";

const HARDHAT_HOST =
    "127.0.0.1";

const HARDHAT_PORT =
    8545;


// =====================================================
// START A CHILD PROCESS
// =====================================================

function startProcess(
    command,
    args,
    options = {}
) {

    return spawn(
        command,
        args,
        {
            cwd: ROOT_DIR,
            stdio: "inherit",
            shell: false,
            ...options
        }
    );
}


// =====================================================
// WAIT FOR HARDHAT RPC
// =====================================================

async function waitForRpc(
    attempts = 60
) {

    const provider =
        new ethers.JsonRpcProvider(
            RPC_URL
        );


    for (
        let attempt = 1;
        attempt <= attempts;
        attempt++
    ) {

        try {

            const network =
                await provider.getNetwork();


            console.log(
                `Hardhat RPC ready. Chain ID: ${network.chainId.toString()}`
            );


            return;

        } catch (error) {

            console.log(
                `Waiting for Hardhat RPC... (${attempt}/${attempts})`
            );


            await new Promise(
                (resolve) =>
                    setTimeout(
                        resolve,
                        1000
                    )
            );
        }
    }


    throw new Error(
        `Timed out waiting for Hardhat RPC at ${RPC_URL}`
    );
}


// =====================================================
// DEPLOY PROOF STORAGE
// =====================================================

function deployProofStorage() {

    return new Promise(
        (resolve, reject) => {

            const command =
                process.platform === "win32"
                    ? "npx.cmd"
                    : "npx";


            const args = [

                "hardhat",

                "ignition",

                "deploy",

                "./ignition/modules/ProofStorage.js",

                "--network",

                "localhost",

                "--reset"

            ];


            console.log(
                ""
            );

            console.log(
                "Deploying ProofStorage..."
            );


            const child =
                spawn(
                    command,
                    args,
                    {
                        cwd:
                            ROOT_DIR,

                        shell:
                            false,

                        stdio: [
                            "ignore",
                            "pipe",
                            "pipe"
                        ]
                    }
                );


            let stdout = "";
            let stderr = "";


            child.stdout.on(
                "data",
                (data) => {

                    const output =
                        data.toString();


                    stdout +=
                        output;


                    process.stdout.write(
                        output
                    );
                }
            );


            child.stderr.on(
                "data",
                (data) => {

                    const output =
                        data.toString();


                    stderr +=
                        output;


                    process.stderr.write(
                        output
                    );
                }
            );


            child.on(
                "error",
                reject
            );


            child.on(
                "close",
                (code) => {

                    if (
                        code !== 0
                    ) {

                        reject(
                            new Error(
                                `ProofStorage deployment failed with exit code ${code}.\n${stderr}`
                            )
                        );

                        return;
                    }


                    const addressMatch =
                        stdout.match(
                            /ProofStorageModule#ProofStorage\s*-\s*(0x[a-fA-F0-9]{40})/
                        );


                    if (
                        !addressMatch
                    ) {

                        reject(
                            new Error(
                                "ProofStorage deployment completed, but the contract address could not be read from Hardhat Ignition output."
                            )
                        );

                        return;
                    }


                    const contractAddress =
                        addressMatch[1];


                    console.log(
                        ""
                    );

                    console.log(
                        `ProofStorage deployed to: ${contractAddress}`
                    );


                    resolve(
                        contractAddress
                    );
                }
            );
        }
    );
}


// =====================================================
// START COMPONENT 1
// =====================================================

function startComponent1() {

    console.log(
        ""
    );

    console.log(
        "Starting Component 1 Express API..."
    );


    const command =
        process.execPath;


    const args = [
        "server.js"
    ];


    const server =
        spawn(
            command,
            args,
            {
                cwd:
                    ROOT_DIR,

                stdio:
                    "inherit",

                shell:
                    false
            }
        );


    server.on(
        "error",
        (error) => {

            console.error(
                "Component 1 process error:",
                error
            );

            process.exit(1);
        }
    );


    server.on(
        "close",
        (code) => {

            console.error(
                `Component 1 server stopped with exit code ${code}`
            );


            process.exit(
                code || 1
            );
        }
    );


    return server;
}


// =====================================================
// MAIN
// =====================================================

async function main() {

    console.log(
        ""
    );

    console.log(
        "========================================"
    );

    console.log(
        " COMPONENT 1 RAILWAY DEMO STARTUP"
    );

    console.log(
        "========================================"
    );

    console.log(
        ""
    );


    // =================================================
    // START HARDHAT
    // =================================================

    console.log(
        "Starting local Hardhat blockchain..."
    );


    const hardhat =
        startProcess(
            process.platform === "win32"
                ? "npx.cmd"
                : "npx",
            [
                "hardhat",
                "node",
                "--hostname",
                HARDHAT_HOST,
                "--port",
                String(HARDHAT_PORT)
            ]
        );


    hardhat.on(
        "error",
        (error) => {

            console.error(
                "Hardhat process error:",
                error
            );

            process.exit(1);
        }
    );


    // =================================================
    // WAIT FOR RPC
    // =================================================

    await waitForRpc();


    // =================================================
    // DEPLOY PROOF STORAGE
    // =================================================

    const contractAddress =
        await deployProofStorage();


    // =================================================
    // MAKE CONTRACT ADDRESS AVAILABLE
    // TO THE EXPRESS PROCESS
    // =================================================

    process.env.CONTRACT_ADDRESS =
        contractAddress;


    process.env.RPC_URL =
        RPC_URL;


    console.log(
        ""
    );

    console.log(
        "Component 1 blockchain configuration:"
    );

    console.log(
        `RPC_URL: ${process.env.RPC_URL}`
    );

    console.log(
        `CONTRACT_ADDRESS: ${process.env.CONTRACT_ADDRESS}`
    );


    // =================================================
    // START EXPRESS SERVER
    // =================================================

    startComponent1();


    // =================================================
    // CLEAN SHUTDOWN
    // =================================================

    const shutdown =
        () => {

            console.log(
                ""
            );

            console.log(
                "Shutting down Component 1 demo stack..."
            );


            try {

                hardhat.kill(
                    "SIGTERM"
                );

            } catch (_) {
                // Ignore shutdown errors.
            }


            process.exit(
                0
            );
        };


    process.on(
        "SIGTERM",
        shutdown
    );

    process.on(
        "SIGINT",
        shutdown
    );
}


// =====================================================
// START
// =====================================================

main()
    .catch(
        (error) => {

            console.error(
                ""
            );

            console.error(
                "Component 1 Railway startup failed:"
            );

            console.error(
                error
            );


            process.exit(
                1
            );
        }
    );