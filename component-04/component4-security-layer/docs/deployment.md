# Component 4 deployment

Component 4 is deployed as one Railway web service. Express serves both the API
and the compiled React frontend, so the frontend's relative `/api` requests use
the same public origin and do not require CORS.

## Architecture

1. The browser talks only to the Component 4 public URL.
2. Component 4 authenticates the employer and receives a candidate, module, and
   claimed grade.
3. Component 4 calls Component 1 at
   `https://component-1-blockchain-production-28cc.up.railway.app/proof` to resolve the
   official anchored record, dataset, blockchain anchor, and Merkle proof.
4. Component 4 compares and verifies the evidence and returns only VALID or
   INVALID to the employer. Component 2 and Component 3 do not need to be called
   directly by Component 4.

## Required ZKP artifacts

The runtime needs the following generated files, but `build/` is intentionally
git-ignored. Generate them once on a trusted development machine:

```powershell
cd component-04/component4-security-layer
npm ci
npm run setup
```

Then force-add only the runtime artifacts before pushing the deployment commit:

```powershell
git add -f build/loginVerifier_js/loginVerifier.wasm
git add -f build/loginVerifier_final.zkey
git add -f build/loginVerifier_verification_key.json
git add -f build/claimBoundVerifier_js/claimBoundVerifier.wasm
git add -f build/claimBoundVerifier_final.zkey
git add -f build/claimBoundVerifier_verification_key.json
git add -f build/verification_key.json
```

Do not run a new trusted setup after deployment unless all artifacts are replaced
together. A production ceremony should use independent entropy contributors;
the repository setup script is suitable for the research prototype.

## Railway deployment

1. Push the repository and the artifacts above to the GitHub repository connected
   to Railway.
2. Create a Railway service from that GitHub repository, set the service root
   directory to `component-04/component4-security-layer`, and deploy with the
   included `Dockerfile`.
3. In Railway Variables, set `MONGODB_URI` to the Component 4 MongoDB Atlas URI. Use
   its own database, for example `ZKP_Login`; do not use Component 1's database.
4. In MongoDB Atlas Network Access, allow Railway's outbound traffic. For a demo,
   `0.0.0.0/0` works but must be protected with a strong database user password.
5. Set `ACADEMIC_DATA_BASE_URL` to
   `https://component-1-blockchain-production-28cc.up.railway.app/proof`.
6. Deploy and open `https://<component-4-service>.up.railway.app/api/health`.
7. Open `https://<component-4-service>.up.railway.app/` for the portal.

Railway supplies `PORT`; do not set a fixed production port. Configure Component
1's proof base URL in Railway Variables. `RPC_URL` and `CONTRACT_ADDRESS` are
only needed when the separate `event-listener.js` worker is deployed; the web
verification path uses Component 1's proof API.

## Post-deploy checks

```text
GET  /api/health
GET  /api/auth/companies
POST /api/auth/signup
POST /api/auth/login
POST /api/verify/claim     (Bearer access token required)
```

Use a real finalized Component 1 candidate/module record for the final claim
test. If login ZKP returns an artifact error, the generated login `.wasm` or
`.zkey` was not included in the pushed commit. If claim verification reports
`ZKP_ARTIFACTS_UNAVAILABLE`, the claim-bound artifacts are missing.
