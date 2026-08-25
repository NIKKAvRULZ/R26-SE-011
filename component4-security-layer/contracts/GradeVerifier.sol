// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Groth16VerifierCore.sol";

/**
 * @title GradeVerifier
 * @notice Access-controlled wrapper around the snarkjs-generated Groth16
 * verifier for circuits/gradeVerifier.circom.
 */
contract GradeVerifier is Groth16VerifierCore {
    address public immutable owner;
    bool public paused;
    bool public verificationKeySet;
    uint256 public proofCount;

    event ProofSubmitted(address indexed submitter, bool valid);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor() {
        owner = msg.sender;
        verificationKeySet = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "GradeVerifier: caller is not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "GradeVerifier: operations are paused");
        _;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function initialize() external onlyOwner {
        verificationKeySet = true;
    }

    function verifyProof(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[1] calldata publicSignals
    ) public view whenNotPaused returns (bool) {
        return verifyGroth16Proof(proofA, proofB, proofC, publicSignals);
    }

    function submitVerification(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[1] calldata publicSignals
    ) external returns (bool valid) {
        valid = verifyProof(proofA, proofB, proofC, publicSignals);
        if (valid) proofCount++;
        emit ProofSubmitted(msg.sender, valid);
    }
}
