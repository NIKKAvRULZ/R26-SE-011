#!/usr/bin/env bash
# compile.sh — Compile the verifier circuits and run the trusted setup (Powers of Tau)
set -euo pipefail

BUILD_DIR="../build/circuits"
PTAU_FILE="../build/pot12_final.ptau"
PTAU_DOWNLOAD="https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau"

circuits=(gradeVerifier loginVerifier)

mkdir -p "$BUILD_DIR"

step=1
for circuit in "${circuits[@]}"; do
  echo "=== [${step}/5] Compiling ${circuit} circuit ==="
  circom "${circuit}.circom" \
    --r1cs \
    --wasm \
    --sym \
    --output "$BUILD_DIR"
done

echo "=== [2/5] Downloading Powers of Tau (if needed) ==="
if [ ! -f "$PTAU_FILE" ]; then
  curl -L "$PTAU_DOWNLOAD" -o "$PTAU_FILE"
fi

for circuit in "${circuits[@]}"; do
  echo "=== [3/5] Generating zkey for ${circuit} ==="
  snarkjs groth16 setup \
    "${BUILD_DIR}/${circuit}.r1cs" \
    "$PTAU_FILE" \
    "${BUILD_DIR}/${circuit}_0000.zkey"

  echo "=== [4/5] Contributing randomness to ${circuit} zkey ==="
  echo "random entropy" | snarkjs zkey contribute \
    "${BUILD_DIR}/${circuit}_0000.zkey" \
    "${BUILD_DIR}/${circuit}_final.zkey" \
    --name="Initial contribution" \
    -v

  echo "=== [5/5] Exporting ${circuit} verification key ==="
  output_key="${BUILD_DIR}/${circuit}_verification_key.json"
  if [ "$circuit" = "gradeVerifier" ]; then
    output_key="${BUILD_DIR}/verification_key.json"
  fi
  snarkjs zkey export verificationkey \
    "${BUILD_DIR}/${circuit}_final.zkey" \
    "$output_key"
done

echo ""
echo "Done! Artifacts are in ${BUILD_DIR}/"
echo "  - gradeVerifier.r1cs"
echo "  - loginVerifier.r1cs"
echo "  - gradeVerifier_js/gradeVerifier.wasm"
echo "  - loginVerifier_js/loginVerifier.wasm"
echo "  - gradeVerifier_final.zkey"
echo "  - loginVerifier_final.zkey"
echo "  - verification_key.json"
echo "  - loginVerifier_verification_key.json"
