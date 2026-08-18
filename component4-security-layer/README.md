# Component 4 — ZKP Security & Verification Layer

Component 4 is the security and verification layer for the academic grading system. It provides a real verification portal for employers and external institutions, combining Zero-Knowledge Proof authentication, Merkle-root integrity checks, IPFS-backed dataset retrieval, and smart-contract formal verification.

## What This Component Does

This component is responsible for:

- authenticating institutions through a dedicated ZKP login flow
- protecting the verification portal behind authenticated access
- retrieving finalized academic datasets from the anchored Merkle-root/IPFS endpoint
- validating candidate records by candidate ID, module code, and claimed grade
- recomputing and checking the canonical record hash
- verifying Merkle membership against the official dataset root
- preserving the existing grade-verification ZKP and Certora formal-verification workflow
- returning a clear valid / invalid / tampered result for employers and external verifiers

## Verification Flow

1. Institution enters credentials on the ZKP login page.
2. The frontend generates a login proof locally.
3. The backend verifies the proof and creates an authenticated session.
4. The verifier portal becomes available to the authenticated user.
5. The portal requests the official finalized dataset using the blockchain Merkle root and dataset CID.
6. The backend retrieves the anchored dataset from the live `/proof/{MERKLE_ROOT}/data` endpoint.
7. The submitted candidate record is canonicalized and hashed.
8. The backend compares the computed hash against the official stored hash.
9. The backend verifies Merkle membership against the finalized dataset root.
10. The result is returned as `VALID` or `INVALID / TAMPERED`.

## Project Structure

```
component4-security-layer/
├── backend/             Express API, ZKP auth, transcript and grade verification
├── build/               Generated circuit artifacts and verification keys
├── circuits/            Circom circuits for login and grade verification
├── contracts/           Groth16 Solidity verifier and interfaces
├── docs/                Formal verification report and supporting documentation
├── formal-verification/ Certora configuration and CVL specs
├── frontend/            React verification portal
├── proof-output/        Anchored dataset summaries and proof outputs
├── scripts/             Setup, deployment, proof, and verification scripts
└── test/                Backend and verification tests
```

## Main Features

### ZKP Login Portal

The portal includes a dedicated institutional login screen with:

- institution ID input
- private ZKP credential input
- proof generation in the browser
- backend proof verification
- authenticated session creation

### Full Transcript Verification

The transcript workflow retrieves the finalized academic dataset and displays the candidate’s record history after authentication. It also calculates off-chain GPA from the verified transcript data.

### Single Grade Verification

The grade verification workflow checks:

- candidate ID
- module code
- claimed grade
- official hash stored in the anchored dataset
- Merkle membership under the published root
- ZKP verification status

### Formal Verification Support

The Solidity verifier and Certora configuration remain part of the component to validate contract behavior and security properties.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Circom | ≥ 2.1 |
| snarkjs | ≥ 0.7 |
| Hardhat | ≥ 2.22 |
| Solidity | 0.8.20 |
| Certora CLI | latest |

## Quick Start

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Prepare circuit artifacts and trusted setup

```bash
node scripts/setup.js
```

### 3. Start the backend API

```bash
cd backend && npm start
```

### 4. Start the frontend portal

```bash
cd frontend && npm run dev
```

### 5. Run tests

```bash
cd test && node component4-verification.test.js
```

### 6. Run Certora formal verification

```bash
export CERTORAKEY=<your-certora-api-key>
bash formal-verification/run-verification.sh
```

## Runtime Notes

- The backend expects the official anchored dataset to be available at the live Merkle-root/IPFS endpoint.
- Merkle roots are normalized before comparison using `root.toLowerCase().replace(/^0x/, '')`.
- Secrets are never stored in localStorage, source code, or API responses.
- The login secret is handled separately from the academic grade proof.

## Security Properties

- **Institution privacy** — the login secret stays private and is never transmitted to the backend.
- **Record integrity** — the portal checks the official hash stored in the finalized dataset.
- **Merkle membership** — the record must belong to the anchored dataset.
- **Access control** — verification endpoints reject unauthenticated requests.
- **Contract assurance** — Certora continues to verify the smart-contract layer independently.

See [docs/verification-report.md](docs/verification-report.md) for the formal-verification report.

## License

MIT
