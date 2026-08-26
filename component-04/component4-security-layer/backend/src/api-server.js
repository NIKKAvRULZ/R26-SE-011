require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const { createVerificationService } = require('./verification-service-fixed');
const { normalizeMerkleRoot } = require('./verification-utils');

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionStore = new Map();
const verificationService = createVerificationService({ sessionStore });

app.use('/build', express.static(path.resolve(__dirname, '..', '..', 'build')));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
    path.resolve(__dirname, '..', '..', 'proof-output', 'public.json'),
    path.resolve(__dirname, '..', '..', 'proof-output', 'proof-summary.json'),
  ];

  for (const candidatePath of candidates) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf8');
      const payload = JSON.parse(raw);

      if (payload?.verificationSource?.blockchain && payload?.data) {
        return payload;
      }

      if (payload?.data?.recordsWithHashes) {
        return payload;
      }
    } catch (error) {
      // continue
    }
  }

  return null;
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'component4-security-layer',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    },
  }),
);

function extractToken(req) {
  const authorization = req.get('authorization') || '';

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return req.session?.token || req.body?.token || null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const sessionData = verificationService.authenticateToken(token);

  if (!sessionData) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  req.authSession = sessionData;
  req.authToken = token;
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/auth/institutions', async (_req, res) => {
  const institutions = await verificationService.listInstitutions();
  res.json({ success: true, institutions });
});

app.get('/api/auth/institutions/:institutionId', async (req, res) => {
  const institutions = await verificationService.listInstitutions();
  const institution = institutions.find((item) => item.id === req.params.institutionId);

  if (!institution) {
    return res.status(404).json({ success: false, error: 'Institution not found' });
  }

  return res.json({ success: true, institution });
});

app.get('/api/verify/source', async (_req, res) => {
  const source = await verificationService.readVerificationSource();
  return res.json({ success: true, source });
});

app.get('/proof/:merkleRoot/data', async (req, res) => {
  const requestedRoot = normalizeMerkleRoot(req.params.merkleRoot);
  const payload = await readLocalVerifiedDataset();

  if (!payload) {
    return res.status(404).json({ success: false, error: 'Verification dataset unavailable' });
  }

  const blockchainRoot = normalizeMerkleRoot(payload?.verificationSource?.blockchain?.merkleRoot || payload?.data?.merkleRoot || '');
  const dataRoot = normalizeMerkleRoot(payload?.data?.merkleRoot || blockchainRoot || '');

  if (requestedRoot !== blockchainRoot && requestedRoot !== dataRoot) {
    return res.status(404).json({ success: false, error: 'Verification dataset not found' });
  }

  return res.json(payload);
});

app.post('/api/auth/zkp', async (req, res) => {
  try {
    const result = await verificationService.verifyLoginProof(req.body || {});

    if (!result.success) {
      return res.status(result.status || 403).json({ success: false, error: result.error });
    }

    req.session.token = result.token;
    req.session.authenticated = true;
    req.session.institutionId = result.institution.id;

    return res.json({
      success: true,
      token: result.token,
      institution: result.institution,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'ZKP authentication failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  verificationService.revokeToken(req.authToken);
  req.session.destroy(() => {});
  return res.json({ success: true });
});

app.get('/api/verify/transcript/:candidateId', requireAuth, async (req, res) => {
  try {
    const transcript = await verificationService.getTranscript(req.params.candidateId);
    return res.json({ success: true, ...transcript });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message || 'Unable to load transcript' });
  }
});

app.post('/api/verify/grade', requireAuth, async (req, res) => {
  try {
    const result = await verificationService.verifyGradeRequest({
      candidateId: req.body?.candidateId,
      moduleCode: req.body?.moduleCode,
      claimedGrade: req.body?.claimedGrade,
      gradeProof: req.body?.gradeProof,
      gradePublicSignals: req.body?.gradePublicSignals,
      sessionToken: req.authToken,
    });

    return res.status(result.status || 200).json({ success: result.success, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Component 4 backend listening on http://localhost:${port}`);
  });
}

module.exports = app;"use strict";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { generateProof, exportSolidityCalldata } = require("./proof-generator");
const {
  buildTranscriptResponse,
  listInstitutions,
  verifyGradeVerification,
  verifyLoginProof,
} = require("./verification-service-fixed");
const { getDatasetByMerkleRoot } = require("./dataset-store");
const { getLoginArtifactPaths } = require("./login-artifacts");
const { requireSession, revokeSession, extractBearerToken } = require("./session-store");
const { getInstitutionById } = require("./institutions");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

function sendArtifact(res, artifactPath, artifactLabel) {
  if (!fs.existsSync(artifactPath)) {
    return res.status(503).json({ error: `${artifactLabel} is not available yet` });
  }

  return res.sendFile(path.resolve(artifactPath));
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/proof/:merkleRoot/data", (req, res) => {
  const dataset = getDatasetByMerkleRoot(req.params.merkleRoot);

  if (!dataset) {
    return res.status(404).json({ success: false, error: "Finalized dataset not found for the supplied Merkle root" });
  }

  return res.json(dataset);
});

app.get("/api/proof/:merkleRoot/data", (req, res) => {
  const dataset = getDatasetByMerkleRoot(req.params.merkleRoot);

  if (!dataset) {
    return res.status(404).json({ success: false, error: "Finalized dataset not found for the supplied Merkle root" });
  }

  return res.json(dataset);
});

app.get("/api/auth/institutions", async (_req, res) => {
  try {
    const institutions = await listInstitutions();
    return res.json({ institutions });
  } catch (error) {
    console.error("Failed to list institutions:", error);
    return res.status(500).json({ error: "Unable to load institutions" });
  }
});

app.get("/api/auth/institutions/:institutionId", async (req, res) => {
  try {
    const institution = await getInstitutionById(req.params.institutionId);

    if (!institution) {
      return res.status(404).json({ error: "Institution not found" });
    }

    return res.json({ institution });
  } catch (error) {
    console.error("Failed to load institution:", error);
    return res.status(500).json({ error: "Unable to load institution" });
  }
});

app.get("/api/auth/artifacts/login/wasm", (_req, res) => {
  const { wasmPath } = getLoginArtifactPaths();
  return sendArtifact(res, wasmPath, "Login circuit WASM");
});

app.get("/api/auth/artifacts/login/zkey", (_req, res) => {
  const { zkeyPath } = getLoginArtifactPaths();
  return sendArtifact(res, zkeyPath, "Login proving key");
});

app.post("/api/auth/zkp", async (req, res) => {
  const { institutionId, proof, publicSignals } = req.body || {};

  if (!institutionId) {
    return res.status(400).json({ error: "Missing required field: institutionId" });
  }

  try {
    const outcome = await verifyLoginProof({ institutionId, proof, publicSignals });

    if (!outcome.ok) {
      return res.status(outcome.status).json({ error: outcome.error });
    }

    return res.json({
      message: "ZKP authentication successful",
      institution: outcome.institution,
      token: outcome.session.token,
      expiresAt: outcome.session.expiresAt,
    });
  } catch (error) {
    console.error("Authentication failed:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
});

app.post("/api/auth/logout", requireSession, (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    revokeSession(token);
  }

  return res.json({ message: "Logged out successfully" });
});

app.post("/api/verify/grade", requireSession, async (req, res) => {
  const { candidateId, moduleCode, claimedGrade } = req.body || {};

  if (!candidateId || !moduleCode || !claimedGrade) {
    return res.status(400).json({ error: "Missing candidateId, moduleCode, or claimedGrade" });
  }

  try {
    const outcome = await verifyGradeVerification({ candidateId, moduleCode, claimedGrade });

    if (!outcome.ok && outcome.status !== 200) {
      return res.status(outcome.status).json({ error: outcome.error, result: outcome.result });
    }

    return res.json(outcome.result);
  } catch (error) {
    console.error("Grade verification failed:", error);
    return res.status(500).json({ error: "Grade verification failed" });
  }
});

app.get("/api/verify/transcript/:candidateId", requireSession, (req, res) => {
  try {
    const outcome = buildTranscriptResponse(req.params.candidateId);

    if (!outcome.ok) {
      return res.status(outcome.status).json({ error: outcome.error });
    }

    return res.json(outcome);
  } catch (error) {
    console.error("Transcript verification failed:", error);
    return res.status(500).json({ error: "Transcript verification failed" });
  }
});

// Legacy compatibility endpoints preserved for the existing proof workflow.
app.post("/api/proof/generate", async (req, res) => {
  const { gradeValue } = req.body || {};

  if (gradeValue === undefined) {
    return res.status(400).json({
      error: "Missing required field: gradeValue (0-5 or F/D/C/B/A/A+)",
    });
  }

  try {
    const { proof, publicSignals, gradeHash } = await generateProof({ gradeValue });
    const calldata = await exportSolidityCalldata(proof, publicSignals);
    return res.json({ proof, publicSignals, gradeHash, calldata });
  } catch (error) {
    if (error instanceof RangeError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Proof generation error:", error);
    return res.status(500).json({ error: "Proof generation failed" });
  }
});

app.post("/api/proof/verify", async (req, res) => {
  const { proof, input } = req.body || {};

  if (!proof || !input || !Array.isArray(input) || input.length < 1) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const snarkjs = require("snarkjs");
    const verificationKeyPath = path.resolve(__dirname, "../build/verification_key.json");

    if (!fs.existsSync(verificationKeyPath)) {
      return res.status(503).json({ error: "Verification key not found. Run npm run setup first." });
    }

    const verificationKey = JSON.parse(fs.readFileSync(verificationKeyPath, "utf8"));
    const isValid = await snarkjs.groth16.verify(verificationKey, input, proof);
    return res.json({ valid: isValid });
  } catch (error) {
    console.error("On-chain verification error:", error);
    return res.status(500).json({ error: "On-chain verification failed" });
  }
});

app.get("/api/verify/:studentId", requireSession, async (req, res) => {
  try {
    const outcome = buildTranscriptResponse(req.params.studentId);

    if (!outcome.ok) {
      return res.status(outcome.status).json({ error: outcome.error });
    }

    return res.json({
      records: outcome.transcript,
      cgpa: outcome.cgpa,
      datasetCid: outcome.datasetCid,
      merkleRoot: outcome.merkleRoot,
    });
  } catch (error) {
    console.error("Legacy verification route failed:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
});

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Verification API server running on port ${PORT}`);
  });
}

module.exports = app;