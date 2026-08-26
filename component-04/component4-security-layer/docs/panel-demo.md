# Panel demonstration checklist

This is the reproducible end-to-end demonstration for Component 4. Component
1 source code is not modified.

## Start the stack

Keep the Component 1 server, its blockchain node, and Component 4 backend
running. The Component 4 `.env` must contain:

```text
ACADEMIC_DATA_BASE_URL=http://localhost:5002/proof
RPC_URL=http://127.0.0.1:8545
REQUIRE_GRADE_ZKP=true
PANEL_CANDIDATE_ID=<current-finalized-candidate>
PANEL_MODULE_CODE=<current-finalized-module>
PANEL_VALID_GRADE=<current-finalized-grade>
```

Component 1 owns `ProofStorage`, IPFS publication, and dataset anchoring.
Component 4 reads the current anchor and never creates or re-anchors academic
data. A persistent testnet/deployed chain is recommended for a permanent
demonstration environment.

## Run the evidence test

From this project directory:

```text
npm run panel:smoke
```

The command performs a real Component 1 lookup, blockchain anchor check, IPFS
dataset/root check, Component 1 Merkle-proof check, and mandatory claim-bound
Groth16 verification. It then submits a tampered grade and asserts `INVALID`.

The panel-visible decision contains only `VALID` or `INVALID`. Marks, grade,
transcript, IPFS payload, Merkle path, and student details are not returned by
the employer API.

## Research claims demonstrated

- Completeness: the current finalized Component 1 claim configured through the
  `PANEL_*` variables verifies.
- Soundness/integrity: changing the grade fails hash and claim-bound ZKP checks.
- Root binding: changing the finalized root invalidates the proof.
- Dataset authenticity: a blockchain/IPFS CID or root mismatch fails closed.
- Privacy boundary: the employer-facing endpoint returns a binary decision.
- Formal layer: the circuit constraints and existing Certora verification
  artifacts document the mathematical verification model.
