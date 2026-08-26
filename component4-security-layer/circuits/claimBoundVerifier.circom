pragma circom 2.0.0;

/*
 * Component 4 claim-bound Groth16 statement.
 *
 * The witness contains the employer claim preimage and the finalized root
 * limbs.  The verifier sees only the claim commitment and root limbs.  This
 * binds one proof to (candidate, module, grade, finalized Merkle root) and
 * prevents replaying a grade proof for another record or dataset.  Component
 * 4 separately verifies Component 1's SHA-256 leaf and Merkle path; the two
 * statements are ANDed by the verification service.
 */
include "circomlib/circuits/poseidon.circom";

template ClaimBoundVerifier() {
    signal input claimCommitment;
    signal input candidateCommitment;
    signal input moduleCommitment;
    signal input gradeValue;
    signal input rootLow;
    signal input rootHigh;

    signal input candidateField;
    signal input moduleField;

    component h = Poseidon(5);
    h.inputs[0] <== candidateField;
    h.inputs[1] <== moduleField;
    h.inputs[2] <== gradeValue;
    h.inputs[3] <== rootLow;
    h.inputs[4] <== rootHigh;
    claimCommitment === h.out;

    // Domain-separated commitments make the public statement explicit and
    // stop a field value from being interpreted as a different claim field.
    component candidateHash = Poseidon(1);
    candidateHash.inputs[0] <== candidateField;
    candidateHash.out === candidateCommitment;

    component moduleHash = Poseidon(1);
    moduleHash.inputs[0] <== moduleField;
    moduleHash.out === moduleCommitment;
}

component main {public [claimCommitment, candidateCommitment, moduleCommitment, rootLow, rootHigh]} = ClaimBoundVerifier();
