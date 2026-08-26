# Verification Report - Component 4: Security Layer

## Overview

This report documents the formal verification and zero-knowledge proof (ZKP)
security properties of the GradeVerifier component.

## 1. System Description

| Item | Detail |
|------|--------|
| Circuits | `circuits/gradeVerifier.circom`, `claimBoundVerifier.circom`, `institutionAuth.circom` |
| Verifier contract | `contracts/GradeVerifier.sol` |
| Proof system | Groth16 over BN254 |
| Formal verifier | Certora Prover (CVL) |

## 2. Security Properties

### 2.1 Zero-Knowledge Circuits

| Property | Status | Notes |
|----------|--------|-------|
| Grade privacy | Circuit-enforced | Actual grade is not a public signal |
| Commitment binding | Circuit-enforced | Poseidon commitment binds the private grade |
| Claim binding | Runtime-tested | Candidate, module, grade, and Component 1 root are bound |
| Institution authentication | Runtime-tested | Secret stays private; its Poseidon commitment is public |

### 2.2 Certora Access Control

| Rule | Status |
|------|--------|
| AC1: only owner can change paused state | Verified |
| AC2: only owner can initialize | Verified |
| AC3: `verifyProof` reverts while paused | Verified |
| AC4: `verifyProof` does not mutate storage | Verified |

### 2.3 Certora State Invariants

| Invariant | Status |
|-----------|--------|
| SI1: verification key never clears once set | Verified |
| SI2: proof counter never decreases | Verified |
| SI3: view verification does not increment counter | Verified |

Certora result: https://prover.certora.com/output/3827879/adef4095c4994e9896e13a1b723f61e0

The original `contract balance always zero` invariant was removed. An EVM
address can be pre-funded or receive forced ETH independently of its payable
functions, so that invariant is not a valid security property.

### 2.4 Arithmetic Safety

| Rule | Status |
|------|--------|
| Public inputs within BN254 scalar field | Enforced by generated verifier |
| Pairing equation | Runtime-tested with valid and tampered proofs |
| Trusted setup | Development ceremony; production MPC required |

The BN254 precompiles are opaque to Certora's SMT model. Certora proves the
wrapper's state and access-control behavior, while proof arithmetic is covered
by the generated verifier and runtime tests.

## 3. Threat Model

| Threat | Mitigation |
|--------|-----------|
| Grade disclosure | Grade remains a private ZKP witness |
| Fake proof submission | Groth16 verifier rejects invalid proofs |
| Claim substitution | Claim circuit binds all public claim fields |
| Privileged state change | Owner-only controls and verified CVL rules |
| API abuse | Rate limiting and authenticated verification endpoints |

## 4. Limitations

- Regenerate the verifier whenever a circuit or final proving key changes.
- Use a production multi-party computation ceremony instead of the development
  trusted setup before a real deployment.
- Formal verification does not replace deployment, API, browser, and circuit
  integration tests.

## 5. Reproduce

```powershell
npm test
npm run test:contract
npm run verify:formal
```

`npm run verify:formal` reads `CERTORAKEY` from `backend/.env` without printing
it, stages a flattened contract to avoid Windows path issues, submits the job,
and waits for the cloud result.

*Updated: 2026-08-25 | Component: component4-security-layer*
