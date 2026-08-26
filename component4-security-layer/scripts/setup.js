"use strict";

/**
 * setup.js
 * ─────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP — Run this before generateProof.js
 *
 * Steps:
 *   1. Compile gradeVerifier.circom  → .r1cs + .wasm
 *   2. Powers of Tau ceremony        → trusted randomness
 *   3. Groth16 Phase 2 setup         → circuit-specific zkey
 *   4. Contribute entropy            → final.zkey
 *   5. Export verification key       → verification_key.json
 *
 * Usage:
 *   node scripts/setup.js
 */

const { execSync }        = require("node:child_process");
const snarkjs             = require("snarkjs");
const { getCurveFromName }= require("ffjavascript");
const path                = require("node:path");
const fs                  = require("node:fs");

// ── Paths ────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const NODE_MODULES = path.join(ROOT, "node_modules");

const CIRCUITS = [
  {
    name: "gradeVerifier",
    file: path.join(ROOT, "circuits", "gradeVerifier.circom"),
    verificationKey: path.join(BUILD_DIR, "verification_key.json"),
  },
  {
    name: "loginVerifier",
    file: path.join(ROOT, "circuits", "loginVerifier.circom"),
    verificationKey: path.join(BUILD_DIR, "loginVerifier_verification_key.json"),
  },
  {
    name: "claimBoundVerifier",
    file: path.join(ROOT, "circuits", "claimBoundVerifier.circom"),
    verificationKey: path.join(BUILD_DIR, "claimBoundVerifier_verification_key.json"),
  },
];

const PTAU_0 = path.join(BUILD_DIR, "pot12_0000.ptau");
const PTAU_1 = path.join(BUILD_DIR, "pot12_0001.ptau");
const PTAU_FINAL = path.join(BUILD_DIR, "pot12_final.ptau");

function regenerateSolidityVerifier(zkeyPath) {
  const outputPath = path.join(ROOT, 'contracts', 'Groth16VerifierCore.sol');
  const snarkjsCli = path.join(NODE_MODULES, 'snarkjs', 'build', 'cli.cjs');
  execSync(`"${process.execPath}" "${snarkjsCli}" zkey export solidityverifier "${zkeyPath}" "${outputPath}"`, { stdio: 'inherit' });

  const generated = fs.readFileSync(outputPath, 'utf8')
    .replace('contract Groth16Verifier {', 'abstract contract Groth16VerifierCore {')
    .replace(
      'function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[1] calldata _pubSignals) public view returns (bool) {',
      'function verifyGroth16Proof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[1] calldata _pubSignals) internal view returns (bool result) {',
    )
    .replace(/\s*checkField\(calldataload\(add\(_pubSignals, 32\)\)\)\s*/, '\n')
    .replace(/\s*mstore\(0, isValid\)\s*return\(0, 0x20\)/, '\n            result := isValid');

  fs.writeFileSync(outputPath, generated, 'utf8');
}

// ── Find the circom binary ────────────────────────────────────────────────
function findCircom() {
  const candidates = [
    "circom",
    path.join(process.env.USERPROFILE || "", ".cargo", "bin", "circom.exe"),
    path.join(process.env.HOME        || "", ".cargo", "bin", "circom"),
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: "pipe" });
      return c;
    } catch { /* try next */ }
  }
  throw new Error(
    "circom binary not found.\n" +
    "  Download from: https://github.com/iden3/circom/releases\n" +
    "  Place circom.exe in your PATH or %USERPROFILE%\\.cargo\\bin\\"
  );
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     ZKP Grade Verifier — One-Time Trusted Setup          ║");
  console.log("║     Research Component 4 · Susara Perera IT22276346      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // ── Step 1: Compile circuits ────────────────────────────────────────
  const circom = findCircom();
  for (const circuit of CIRCUITS) {
    console.log(`[ 1 / 5 ]  Compiling ${circuit.name}.circom ...`);
    execSync(
      `"${circom}" "${circuit.file}" --r1cs --wasm --sym -l "${NODE_MODULES}" -o "${BUILD_DIR}"`,
      { stdio: "inherit" }
    );
    console.log(`           ✓ Circuit compiled  →  build/${circuit.name}.r1cs\n`);
  }

  // ── Step 2: Powers of Tau (Phase 1) ─────────────────────────────────
  console.log("[ 2 / 5 ]  Generating Powers of Tau  (BN128, 2^12 constraints) ...");
  const curve = await getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, 12, PTAU_0);
  await snarkjs.powersOfTau.contribute(
    PTAU_0, PTAU_1,
    "Prototype Contribution",
    "GradeVerifier-SLIIT-IT22276346-2026-entropy"
  );
  await snarkjs.powersOfTau.preparePhase2(PTAU_1, PTAU_FINAL);
  await curve.terminate();
  console.log("           ✓ Powers of Tau ready  →  build/pot12_final.ptau\n");

  // ── Step 3-5: Groth16 setup for each circuit ───────────────────────
  for (const circuit of CIRCUITS) {
    const r1csPath = path.join(BUILD_DIR, `${circuit.name}.r1cs`);
    const zkey0Path = path.join(BUILD_DIR, `${circuit.name}_0000.zkey`);
    const zkeyFinalPath = path.join(BUILD_DIR, `${circuit.name}_final.zkey`);

    console.log(`[ 3 / 5 ]  Groth16 setup for ${circuit.name} ...`);
    await snarkjs.zKey.newZKey(r1csPath, PTAU_FINAL, zkey0Path);
    console.log(`           ✓ Initial zkey  →  build/${circuit.name}_0000.zkey\n`);

    console.log(`[ 4 / 5 ]  Contributing entropy to ${circuit.name} ...`);
    await snarkjs.zKey.contribute(
      zkey0Path, zkeyFinalPath,
      "Susara Perera SLIIT",
      `second-entropy-contribution-2026-SLIIT-RP-${circuit.name}`
    );
    console.log(`           ✓ Final zkey  →  build/${circuit.name}_final.zkey\n`);

    console.log(`[ 5 / 5 ]  Exporting ${circuit.name} verification key ...`);
    const vk = await snarkjs.zKey.exportVerificationKey(zkeyFinalPath);
    fs.writeFileSync(circuit.verificationKey, JSON.stringify(vk, null, 2));
    if (circuit.name === 'gradeVerifier') regenerateSolidityVerifier(zkeyFinalPath);
    console.log(`           ✓ Verification key  →  ${path.relative(ROOT, circuit.verificationKey)}\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════════════════");
  console.log("  ✅  Setup complete!  Artifacts generated in build/");
  console.log();
  console.log("     build/gradeVerifier.r1cs              grade circuit constraints");
  console.log("     build/loginVerifier.r1cs              login circuit constraints");
  console.log("     build/*_js/*.wasm                      witness generators");
  console.log("     build/*_final.zkey                    proving keys");
  console.log("     build/verification_key.json            grade verifying key");
  console.log("     build/loginVerifier_verification_key.json  login verifying key");
  console.log("     build/claimBoundVerifier_verification_key.json  claim-bound verifying key");
  console.log();
  console.log("  Next steps:");
  console.log("     npm run generate    →  generate ZKP proof from grade");
  console.log("     npm run verify      →  verify the proof");
  console.log("══════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n❌  Setup failed:", err.message);
  process.exit(1);
});
