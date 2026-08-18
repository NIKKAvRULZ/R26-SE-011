pragma circom 2.0.0;

/*
 * loginVerifier.circom
 *
 * Zero-knowledge authentication circuit for the verification portal.
 *
 * Private input:
 *   - institutionSecretField: field element derived from the institution's
 *     local secret after client-side normalization.
 *
 * Public input:
 *   - institutionCommitment: Poseidon commitment registered for the institution.
 */

include "circomlib/circuits/poseidon.circom";

template LoginVerifier() {
    signal input institutionSecretField;
    signal input institutionCommitment;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== institutionSecretField;
    institutionCommitment === hasher.out;
}

component main { public [institutionCommitment] } = LoginVerifier();
