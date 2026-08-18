require('dotenv').config();

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { createVerificationService } = require('./verification-service-clean');
const { normalizeMerkleRoot } = require('./verification-utils');
const { getDatasetByMerkleRoot, IPFS_DATASET_PAYLOAD } = require('./dataset-store');

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionStore = new Map();
const verificationService = createVerificationService({ sessionStore });

app.use('/build', express.static(path.resolve(__dirname, '..', '..', 'build')));
app.use(express.json({ limit: '2mb' }));

async function readLocalVerifiedDataset() {
  const candidates = [
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
    } catch (_error) {
      // continue
    }
  }

  return null;
}

function extractToken(req) {
  const authorization = req.get('authorization') || '';

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return req.body?.token || null;
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
  const dataset = getDatasetByMerkleRoot(requestedRoot);

  if (dataset) {
    return res.json(dataset);
  }

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

    return res.json({
      success: true,
      token: result.token,
      institution: result.institution,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'ZKP authentication failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  verificationService.revokeToken(req.authToken);
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
  } catch (_error) {
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

module.exports = app;
