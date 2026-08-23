# Company authentication and audit storage

Component 4 uses MongoDB only for its own operational security data. It does not copy or modify Component 1 academic records.

| Collection | Purpose |
| --- | --- |
| `component4companies` | Registered companies shown in the company-login selector. |
| `component4users` | Company administrator, verifier, and auditor accounts. Passwords are bcrypt hashes. |
| `component4sessions` | Refresh-token session identifiers, rotation, expiry, and revocation state. Raw tokens are never stored. |
| `component4audits` | Company signup, login success/failure, account administration, and password events. |
| `component4verificationattempts` | Immutable verification-attempt outcomes and integrity checks. |

## Operational workflow

1. A company administrator signs up with a unique Company ID and work email.
2. The company and its administrator are persisted in MongoDB; no sample account is inserted.
3. The login selector calls `GET /api/auth/companies`, so it contains only active companies that have signed up.
4. On sign-in, Component 4 validates the bcrypt password, applies lockout protection after repeated failures, records an audit event, and creates a JWT access token plus a Mongo-backed refresh session.
5. An administrator can create verifier/auditor accounts for the same company. Role checks protect the transcript and claim-verification APIs.
6. A company user submits a claim. Component 4 obtains the record reference from Component 1 and validates the blockchain anchor, IPFS dataset, canonical hash, Merkle proof, and optional grade ZKP before writing a verification audit record.

`MONGODB_URI` belongs in `backend/.env`; keep `.env` out of version control. For a local MongoDB service use `mongodb://127.0.0.1:27017/ZKP_Login`.
