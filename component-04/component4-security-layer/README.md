# Component 4 — ZKP Security & Verification Layer

Component 4 is the security and verification layer for the academic grading system. It provides a real verification portal for employers and external institutions, combining role-based company authentication, Merkle-root integrity checks, IPFS-backed dataset retrieval, and smart-contract formal verification.

## What This Component Does

This component is responsible for:

- authenticating company verifiers through role-based account login
- protecting the verification portal behind authenticated access
- enforcing login lockout and password policy controls for company accounts
- providing admin user governance (create users, assign roles, rotate passwords, review audit events)
- retrieving finalized academic datasets from the anchored Merkle-root/IPFS endpoint
- validating candidate records by candidate ID, module code, and claimed grade
- recomputing and checking the canonical record hash
- verifying Merkle membership against the official dataset root
- preserving the existing grade-verification ZKP and Certora formal-verification workflow
- returning a clear valid / invalid / tampered result for employers and external verifiers

## Verification Flow

1. Company verifier enters organization credentials on the login page.
2. The backend validates the account and role, applies lockout protection on repeated failures, then creates an authenticated session token.
3. Role-based access is enforced before transcript/grade verification endpoints are processed.
4. Company admins can manage users and roles from the Admin Console.
5. The verifier portal becomes available to the authenticated user.
6. The portal requests the official finalized dataset using the blockchain Merkle root and dataset CID.
7. The backend retrieves the anchored dataset from `/proof/{MERKLE_ROOT}/data`.
8. The backend calls `POST /proof/merkle-proof` to obtain the official hash and Merkle proof for the specific candidate/module.
9. The submitted candidate record is canonicalized and hashed.
10. The backend compares the computed hash against the official stored hash and verifies the returned Merkle proof.
11. The result is returned as `VALID` or `INVALID / TAMPERED`.

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

### Professional Login Portal

The portal includes three explicit access modes:

- **Company Login**: company ID + work email + password
- **Institution ZKP Login**: institution ID + private secret on client, proof verification on server
- **Company Sign Up**: register a new company and first admin account

And supports:

- role-based access control (admin / verifier / auditor / institution)
- backend credential verification and login lockout
- admin-only user and role governance console

### Full Transcript Verification

The transcript workflow resolves Component 1's latest blockchain anchor, retrieves the matching IPFS dataset, and verifies every finalized candidate leaf. The employer receives only `VALID` or `INVALID`; transcript records and grades are not disclosed.

### Single Grade Verification

The grade verification workflow checks:

- candidate ID
- module code
- claimed grade
- official hash stored in the anchored dataset
- Merkle membership under the published root
- ZKP verification status

### Formal Verification Support

The Solidity layer wraps a `snarkjs`-generated Groth16 verifier with owner-only pause controls and successful-proof accounting. Certora CVL properties cover access control and state invariants.

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
cd component4-security-layer/backend && npm install
cd ../frontend && npm install
```

### 2. Configure backend environment

Create `backend/.env` with at least:

```dotenv
PORT=3000
DEMO_INSTITUTION_SECRET=demo-institution-zkp-secret
```

Optional: use the built-in development company accounts in `backend/src/company-accounts.js`.

Optional hardening environment variables:

```dotenv
AUTH_PASSWORD_MIN_LENGTH=12
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_ATTEMPT_WINDOW_MINUTES=15
AUTH_LOCKOUT_MINUTES=30
```

Optional organization bootstrap from environment:

`COMPANY_AUTH_CONFIG_JSON` can provide companies/users as JSON (users support `passwordHash` or `password` values).

### 3. Prepare circuit artifacts and trusted setup

```bash
cd ..
node scripts/setup.js
```

### 4. Start the backend API

```bash
cd backend
npm start
```

Backend URL: `http://localhost:3000`

### 5. Start the frontend portal

```bash
cd ../frontend
npm run dev
```

Frontend URL: `http://127.0.0.1:5174`

Note: frontend is pinned to port `5174` with strict-port mode. If `5174` is already occupied, stop the conflicting process first.

### 6. Create your company account (real onboarding)

Use **Company Sign Up** in the portal to create:

- Company ID
- Company name
- First admin name/email/password

After signup, login with that admin account.

Admin users can open **Admin Console** mode and:

- create verifier/auditor/admin users
- change user roles
- rotate user passwords
- view company-scoped audit events
- register institution ZKP commitments without sending the institution secret to the backend

### 7. Institution ZKP login mode

Use **Institution ZKP Login** when you want authentication via proof rather than password login.

- Institution ID (public)
- Secret remains on client
- Frontend generates proof/public signals
- Backend verifies proof and grants session token

### 8. Run tests

```bash
npm test
npm run test:contract
npm run panel:smoke
```

### 9. Run Certora formal verification

```bash
export CERTORAKEY=<your-certora-api-key>
bash formal-verification/run-verification.sh
```

## Runtime Notes

- The backend expects the official anchored dataset to be available at the live Merkle-root/IPFS endpoint.
- `ACADEMIC_DATA_BASE_URL` is mandatory. Component 4 has no academic-record fallback or mock proof API.
- Merkle roots are normalized before comparison using `root.toLowerCase().replace(/^0x/, '')`.
- Grade verification uses the bridge endpoint `POST /proof/merkle-proof` and validates the returned official hash + Merkle path.
- Role-based account sessions are required for transcript and grade verification endpoints.
- Secrets are never returned in API responses.

## API Endpoints Used By Component 4

- `GET /proof/{MERKLE_ROOT}`: anchored blockchain proof metadata (`merkleRoot`, `ipfsCID`, `timestamp`, `uploadedBy`).
- `GET /proof/latest`: latest Component 1 blockchain anchor used for transcript verification.
- `GET /proof/{MERKLE_ROOT}/data`: finalized dataset records for the root.
- `POST /proof/merkle-proof`: official record hash + leaf index + Merkle proof for one candidate/module.
- `GET /api/auth/companies`: available company list for verifier login.
- `POST /api/auth/login`: company verifier login (`companyId`, `email`, `password`).
- `GET /api/auth/institutions`: registered public institution commitments.
- `POST /api/auth/zkp`: Groth16 institution authentication.
- `POST /api/auth/signup`: public company onboarding (`companyId`, `companyName`, `adminName`, `adminEmail`, `adminPassword`).
- `GET /api/auth/me`: current authenticated session profile.
- `GET /api/admin/users`: admin-only list users in admin's company and current password policy.
- `POST /api/admin/users`: admin-only create user (`email`, `name`, `role`, `password`).
- `PATCH /api/admin/users/{email}`: admin-only update role and/or rotate password.
- `GET /api/admin/audit?limit=40`: admin-only audit events for current company.

Example request:

```http
POST http://localhost:3000/proof/merkle-proof
Content-Type: application/json

{
	"merkleRoot": "0xcb724294241df65a74414905038457ff8bde3671635f518612a25f7978de58c9",
	"candidateId": "IT001",
	"moduleCode": "SE3050"
}
```

## Security Properties

- **Role-based access** — only authenticated verifier roles can call protected verification APIs.
- **Brute-force protection** — failed login attempts trigger temporary account lockout.
- **Credential hygiene** — password policy enforced for user creation and password resets.
- **Record integrity** — the portal checks the official hash stored in the finalized dataset.
- **Merkle membership** — the record must belong to the anchored dataset.
- **Access control** — verification endpoints reject unauthenticated requests.
- **Contract assurance** — Certora continues to verify the smart-contract layer independently.

See [docs/verification-report.md](docs/verification-report.md) for the formal-verification report.

## License

MIT
