# Claim-bound ZKP deployment

Component 4 now includes `circuits/claimBoundVerifier.circom`. Component 1 is
unchanged and remains the academic source of truth.

The Groth16 statement proves knowledge of private witness values for the
candidate identifier, module code, grade, and the two 128-bit limbs of the
finalized Merkle root. A public Poseidon commitment binds all five values:

`C = Poseidon(candidateField, moduleField, gradeValue, rootLow, rootHigh)`

The service composes this proof with Component 1's SHA-256 leaf check and
returned Merkle path check. The employer API still returns only `VALID` or
`INVALID`; no marks, grade, transcript, CID, or student details are returned.

## Generate production artifacts

From `component4-security-layer`:

```text
node scripts/setup.js
```

This generates `build/claimBoundVerifier_js/claimBoundVerifier.wasm`,
`build/claimBoundVerifier_final.zkey`, and
`build/claimBoundVerifier_verification_key.json`. The backend fails closed when
the mandatory artifacts are missing.

Set the backend environment:

```text
ACADEMIC_DATA_BASE_URL=http://localhost:<component-1-port>/proof
REQUIRE_GRADE_ZKP=true
```

For each claim Component 4 calls `/record/{candidateId}/{moduleCode}`, then
`/{merkleRoot}`, `/{merkleRoot}/data`, and `/merkle-proof`. Any root, CID, leaf,
or proof mismatch produces `INVALID` and is written to the operational audit
store. Component 1 is never changed or used as a mutable duplicate database.
