const { expect } = require('chai');
const { ethers } = require('hardhat');
const path = require('node:path');
const snarkjs = require('snarkjs');
const { buildPoseidon } = require('circomlibjs');

describe('GradeVerifier contract', function () {
  this.timeout(120_000);

  let verifier;
  let owner;
  let other;
  let solidityProof;
  let publicSignals;

  before(async () => {
    [owner, other] = await ethers.getSigners();
    verifier = await (await ethers.getContractFactory('GradeVerifier')).deploy();
    await verifier.waitForDeployment();

    const poseidon = await buildPoseidon();
    const gradeValue = 4n;
    const gradeHash = poseidon.F.toString(poseidon([gradeValue]));
    const generated = await snarkjs.groth16.fullProve(
      { gradeValue: gradeValue.toString(), gradeHash },
      path.resolve(__dirname, '..', 'build', 'gradeVerifier_js', 'gradeVerifier.wasm'),
      path.resolve(__dirname, '..', 'build', 'gradeVerifier_final.zkey'),
    );
    publicSignals = generated.publicSignals;
    solidityProof = {
      A: [generated.proof.pi_a[0], generated.proof.pi_a[1]],
      B: [
        [generated.proof.pi_b[0][1], generated.proof.pi_b[0][0]],
        [generated.proof.pi_b[1][1], generated.proof.pi_b[1][0]],
      ],
      C: [generated.proof.pi_c[0], generated.proof.pi_c[1]],
    };
  });

  after(async () => {
    await globalThis.curve_bn128?.terminate();
    await globalThis.curve_bls12381?.terminate();
  });

  it('accepts the real Groth16 proof and rejects a different public commitment', async () => {
    expect(await verifier.verifyProof(solidityProof.A, solidityProof.B, solidityProof.C, publicSignals)).to.equal(true);
    expect(await verifier.verifyProof(solidityProof.A, solidityProof.B, solidityProof.C, [(BigInt(publicSignals[0]) + 1n).toString()])).to.equal(false);
  });

  it('enforces owner-only pause and blocks verification while paused', async () => {
    await expect(verifier.connect(other).pause()).to.be.revertedWith('GradeVerifier: caller is not owner');
    await verifier.connect(owner).pause();
    await expect(verifier.verifyProof(solidityProof.A, solidityProof.B, solidityProof.C, publicSignals)).to.be.revertedWith('GradeVerifier: operations are paused');
    await verifier.connect(owner).unpause();
  });

  it('increments proofCount only for a valid submitted proof', async () => {
    await verifier.submitVerification(solidityProof.A, solidityProof.B, solidityProof.C, publicSignals);
    expect(await verifier.proofCount()).to.equal(1n);
    await verifier.submitVerification(solidityProof.A, solidityProof.B, solidityProof.C, [(BigInt(publicSignals[0]) + 1n).toString()]);
    expect(await verifier.proofCount()).to.equal(1n);
  });
});
