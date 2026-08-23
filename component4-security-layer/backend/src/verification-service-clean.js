const fs = require('fs/promises');
const path = require('path');
const crypto = require('node:crypto');
const jwt = require('./jwt-adapter');
const snarkjs = require('snarkjs');
const {
  canonicalRecordString,
  canonicalizeIdentifier,
  gradeToGpa,
  getMerkleProof,
  normalizeMerkleRoot,
  sha256Hex,
  verifyMerkleProof,
} = require('./verification-utils');
const { listInstitutions, registerInstitution, resolveInstitution } = require('./institutions-clean');
const {
  listCompanies,
  authenticateCompanyUser,
  createCompanyUser,
  updateCompanyUser,
  listCompanyUsers,
  listAuditEvents,
  getPasswordPolicySummary,
  registerCompanyAdmin,
  getUserByEmail,
  getUserById,
  bumpRefreshTokenVersion,
  createRefreshSession,
  getRefreshSession,
  revokeRefreshSession,
  revokeUserRefreshSessions,
  ensureEmailVerificationToken,
  verifyEmailWithToken,
  ensurePasswordResetToken,
  resetPasswordWithToken,
  addAuditEvent,
} = require('./company-accounts');
const { IPFS_DATASET_PAYLOAD } = require('./dataset-store');
const { recordVerificationAttempt } = require('./mongo-verification-store');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EMAIL_OUTBOX_FILE = path.join(DATA_DIR, 'email-outbox.json');

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'component4-dev-access-secret-change-me';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'component4-dev-refresh-secret-change-me';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '7d';

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function persistJson(filePath, value) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function randomId() {
  return crypto.randomBytes(16).toString('hex');
}

function parseDurationMs(value, fallbackMs) {
  if (!value || typeof value !== 'string') return fallbackMs;
  const match = value.match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;

  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

function buildSessionFromClaims(claims) {
  return {
    role: claims.role,
    companyId: claims.companyId,
    companyName: claims.companyName,
    userEmail: claims.userEmail,
    userName: claims.userName,
    userId: claims.sub,
    authType: claims.authType || 'company-credentials',
    institutionId: claims.institutionId || null,
    institutionName: claims.institutionName || null,
    authenticated: true,
    authenticatedAt: claims.iat ? new Date(claims.iat * 1000).toISOString() : new Date().toISOString(),
  };
}

async function appendEmailOutbox(message) {
  const outbox = (await readJsonIfExists(EMAIL_OUTBOX_FILE)) || { messages: [] };
  if (!Array.isArray(outbox.messages)) {
    outbox.messages = [];
  }

  outbox.messages.push({
    id: randomId(),
    createdAt: new Date().toISOString(),
    ...message,
  });

  if (outbox.messages.length > 2000) {
    outbox.messages = outbox.messages.slice(-2000);
  }

  await persistJson(EMAIL_OUTBOX_FILE, outbox);
}

function createVerificationService(options = {}) {
  // This must be Component 1 in a deployed system. Component 4 never selects a
  // root itself: Component 1 maps candidate + module to the anchored root/CID.
  const dataBaseUrl = (options.dataBaseUrl || process.env.ACADEMIC_DATA_BASE_URL || 'http://localhost:3000/proof').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || global.fetch;
  const verifyProofImpl = options.verifyProofImpl || null;
  const authenticateTokenImpl = options.authenticateTokenImpl || null;
  const refreshTokenTtlMs = parseDurationMs(REFRESH_TOKEN_TTL, 7 * 24 * 60 * 60 * 1000);

  const loginVerificationKeyPaths = options.loginVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_vkey.json'),
    path.resolve(__dirname, '..', '..', 'build', 'verification_key.json'),
  ];
  const gradeVerificationKeyPaths = options.gradeVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'gradeVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'gradeVerifier_vkey.json'),
  ];

  async function loadVerificationKey(candidatePaths) {
    for (const candidatePath of candidatePaths) {
      const key = await readJsonIfExists(candidatePath);
      if (key) {
        return key;
      }
    }

    return null;
  }

  async function verifyProof({ proof, publicSignals, keyPaths }) {
    if (verifyProofImpl) {
      return verifyProofImpl({ proof, publicSignals, keyPaths });
    }

    const verificationKey = await loadVerificationKey(keyPaths);
    if (!verificationKey) {
      // Missing verification material must never turn into an authentication or
      // verification success.
      return false;
    }

    try {
      return await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    } catch (_error) {
      return false;
    }
  }

  async function requestJson(url, options = {}) {
    if (!fetchImpl) {
      throw new Error('Fetch is not available in this runtime');
    }

    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetchImpl(url, requestOptions);
    if (!response.ok) {
      const error = new Error(`Failed to fetch verification data: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function fetchJson(url) {
    return requestJson(url);
  }

  async function issueTokensForUser(user, authType = 'company-credentials') {
    const jti = randomId();

    const baseClaims = {
      sub: user.userId,
      role: user.role,
      companyId: user.companyId,
      companyName: user.companyName,
      userEmail: user.email,
      userName: user.name,
      authType,
    };

    const accessToken = jwt.sign(baseClaims, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'component4-security-layer',
      audience: 'component4-api',
    });

    const refreshToken = jwt.sign(
      {
        sub: user.userId,
        typ: 'refresh',
        ver: user.refreshTokenVersion || 0,
        jti,
      },
      REFRESH_TOKEN_SECRET,
      {
        expiresIn: REFRESH_TOKEN_TTL,
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      },
    );

    const now = Date.now();
    await createRefreshSession({
      jti,
      userId: user.userId,
      companyId: user.companyId,
      version: user.refreshTokenVersion || 0,
      expiresAt: new Date(now + refreshTokenTtlMs),
    });

    return {
      accessToken,
      refreshToken,
      session: buildSessionFromClaims(baseClaims),
    };
  }

  async function authenticateToken(token) {
    if (!token) return null;

    if (authenticateTokenImpl) {
      return authenticateTokenImpl(token);
    }

    try {
      const claims = jwt.verify(token, ACCESS_TOKEN_SECRET, {
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      });
      return buildSessionFromClaims(claims);
    } catch (_error) {
      return null;
    }
  }

  async function refreshSessionTokens(refreshToken) {
    if (!refreshToken) {
      return { success: false, status: 400, error: 'refreshToken is required' };
    }

    let claims;
    try {
      claims = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, {
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      });
    } catch (_error) {
      return { success: false, status: 401, error: 'Invalid refresh token' };
    }

    if (claims.typ !== 'refresh' || !claims.jti) {
      return { success: false, status: 401, error: 'Invalid refresh token' };
    }

    const record = await getRefreshSession(claims.jti);

    if (!record || record.revokedAt || record.replacedBy) {
      const userId = claims.sub;
      await revokeUserRefreshSessions(userId);
      await bumpRefreshTokenVersion(userId);

      return { success: false, status: 401, error: 'Refresh token replay detected. Please sign in again.' };
    }

    if (Date.now() > new Date(record.expiresAt).getTime()) {
      await revokeRefreshSession(record.jti);
      return { success: false, status: 401, error: 'Refresh token expired' };
    }

    const user = await getUserById(claims.sub);
    if (!user || user.status !== 'active') {
      return { success: false, status: 401, error: 'User is inactive' };
    }

    const expectedVersion = Number(user.refreshTokenVersion || 0);
    if (Number(claims.ver) !== expectedVersion || Number(record.version) !== expectedVersion) {
      await revokeRefreshSession(record.jti);
      return { success: false, status: 401, error: 'Refresh token invalidated. Please sign in again.' };
    }

    const issued = await issueTokensForUser(user, 'company-credentials');
    const nextClaims = jwt.decode(issued.refreshToken);

    await revokeRefreshSession(record.jti, nextClaims?.jti || null);

    return {
      success: true,
      status: 200,
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
    };
  }

  async function revokeToken({ refreshToken }) {
    if (!refreshToken) return;

    try {
      const claims = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, {
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      });
      await revokeRefreshSession(claims.jti);
    } catch (_error) {
      // Ignore invalid refresh tokens during logout.
    }
  }

  async function readVerificationSource() {
    const candidates = [
      path.resolve(__dirname, '..', '..', 'proof-output', 'public.json'),
      path.resolve(__dirname, '..', '..', 'proof-output', 'proof-summary.json'),
    ];

    for (const candidatePath of candidates) {
      const payload = await readJsonIfExists(candidatePath);
      if (payload?.verificationSource?.blockchain) {
        const blockchain = payload.verificationSource.blockchain;
        return {
          merkleRoot: normalizeMerkleRoot(blockchain.merkleRoot || payload.data?.merkleRoot),
          ipfsCID: blockchain.ipfsCID || payload.data?.ipfsCID || null,
          timestamp: blockchain.timestamp || payload.data?.generatedAt || null,
          uploadedBy: blockchain.uploadedBy || null,
        };
      }
      if (payload?.data?.merkleRoot) {
        return {
          merkleRoot: normalizeMerkleRoot(payload.data.merkleRoot),
          ipfsCID: payload.verificationSource?.blockchain?.ipfsCID || null,
          timestamp: payload.data?.generatedAt || null,
          uploadedBy: payload.verificationSource?.blockchain?.uploadedBy || null,
        };
      }
    }

    return {
      merkleRoot: normalizeMerkleRoot(
        process.env.ACADEMIC_MERKLE_ROOT ||
          IPFS_DATASET_PAYLOAD?.verificationSource?.blockchain?.merkleRoot ||
          IPFS_DATASET_PAYLOAD?.data?.merkleRoot ||
          '',
      ),
      ipfsCID:
        process.env.ACADEMIC_IPFS_CID ||
        IPFS_DATASET_PAYLOAD?.verificationSource?.blockchain?.ipfsCID ||
        null,
      timestamp:
        IPFS_DATASET_PAYLOAD?.verificationSource?.blockchain?.timestamp ||
        IPFS_DATASET_PAYLOAD?.data?.generatedAt ||
        null,
      uploadedBy: IPFS_DATASET_PAYLOAD?.verificationSource?.blockchain?.uploadedBy || null,
    };
  }

  async function fetchFinalizedDataset(merkleRoot) {
    const normalizedRoot = normalizeMerkleRoot(merkleRoot);
    return fetchJson(`${dataBaseUrl}/${normalizedRoot}/data`);
  }

  async function fetchOfficialMerkleProof({ merkleRoot, candidateId, moduleCode }) {
    return requestJson(`${dataBaseUrl}/merkle-proof`, {
      method: 'POST',
      body: {
        merkleRoot,
        candidateId,
        moduleCode,
      },
    });
  }

  async function fetchAnchoredMetadata(merkleRoot) {
    const normalizedRoot = normalizeMerkleRoot(merkleRoot);
    return fetchJson(`${dataBaseUrl}/${normalizedRoot}`);
  }

  async function lookupAnchoredRecord({ candidateId, moduleCode, version }) {
    const candidate = canonicalizeIdentifier(candidateId);
    const module = canonicalizeIdentifier(moduleCode);
    const query = version == null || version === '' ? '' : `?version=${encodeURIComponent(version)}`;
    const payload = await fetchJson(`${dataBaseUrl}/record/${encodeURIComponent(candidate)}/${encodeURIComponent(module)}${query}`);
    // Component 1 may return the reference in `record` or at the top level.
    const record = payload?.record || payload;
    const merkleRoot = normalizeMerkleRoot(record?.merkleRoot);

    if (!payload?.success || !record || !merkleRoot || !record.ipfsCID) {
      const error = new Error('Component 1 returned an invalid anchored-record lookup response');
      error.status = 502;
      throw error;
    }

    return {
      candidateId: candidate,
      moduleCode: module,
      version: record.version,
      merkleRoot,
      ipfsCID: record.ipfsCID,
    };
  }

  async function getOfficialVerificationDataset() {
    const source = await readVerificationSource();
    if (!source.merkleRoot) {
      throw new Error('No anchored Merkle root is configured for verification');
    }

    const dataset = await fetchFinalizedDataset(source.merkleRoot);
    const blockchainRoot = normalizeMerkleRoot(dataset?.verificationSource?.blockchain?.merkleRoot || source.merkleRoot);
    const ipfsCID = dataset?.verificationSource?.blockchain?.ipfsCID || source.ipfsCID || null;
    const records = Array.isArray(dataset?.data?.recordsWithHashes) ? dataset.data.recordsWithHashes : [];
    const dataRoot = normalizeMerkleRoot(dataset?.data?.merkleRoot || source.merkleRoot);

    return {
      blockchainRoot,
      dataRoot,
      ipfsCID,
      dataset,
      records,
      source,
      totalRecords: dataset?.data?.totalRecords ?? records.length,
    };
  }

  async function getTranscript(candidateId) {
    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const verificationDataset = await getOfficialVerificationDataset();
    const candidateRecords = verificationDataset.records.filter(
      (record) => canonicalizeIdentifier(record.candidateId) === normalizedCandidateId,
    );

    if (candidateRecords.length === 0) {
      const error = new Error('Candidate not found');
      error.status = 404;
      throw error;
    }

    const transcriptEntries = candidateRecords.map((record, index) => ({
      ...record,
      gpa: gradeToGpa(record.grade),
      index,
    }));

    return {
      candidateId: normalizedCandidateId,
      verificationSource: {
        blockchain: {
          merkleRoot: verificationDataset.blockchainRoot,
          ipfsCID: verificationDataset.ipfsCID,
          timestamp: verificationDataset.source.timestamp,
          uploadedBy: verificationDataset.source.uploadedBy,
        },
      },
      data: {
        merkleRoot: verificationDataset.dataRoot,
        totalRecords: verificationDataset.totalRecords,
        generatedAt: verificationDataset.dataset?.data?.generatedAt || null,
        recordsWithHashes: transcriptEntries,
      },
      transcript: transcriptEntries,
      gpa: transcriptEntries.length
        ? transcriptEntries.reduce((sum, record) => sum + (record.gpa ?? 0), 0) / transcriptEntries.length
        : null,
    };
  }

  async function verifyLoginProof({ institutionId, proof, publicSignals, commitment }) {
    const institution = await resolveInstitution(institutionId);
    if (!institution) {
      return { success: false, status: 404, error: 'Unknown institution' };
    }

    const normalizedSignals = Array.isArray(publicSignals) ? publicSignals.map((value) => normalizeMerkleRoot(value)) : [];
    const normalizedCommitment = normalizeMerkleRoot(commitment || normalizedSignals[0] || '');

    if (normalizedCommitment !== institution.commitment) {
      return { success: false, status: 403, error: 'Institution commitment mismatch' };
    }

    if (!proof || !Array.isArray(publicSignals) || normalizedSignals.length !== 1 || normalizedSignals[0] !== institution.commitment) {
      return { success: false, status: 400, error: 'A Groth16 proof with the institution commitment as its only public signal is required' };
    }

    const verified = await verifyProof({ proof, publicSignals, keyPaths: loginVerificationKeyPaths });
    if (!verified) {
      return { success: false, status: 403, error: 'ZKP authentication failed' };
    }

    const claims = {
      sub: `inst:${institution.id}`,
      role: 'institution',
      companyId: institution.id,
      companyName: institution.name,
      userEmail: `${institution.id.toLowerCase()}@institution.local`,
      userName: institution.name,
      authType: 'zkp-institution',
      institutionId: institution.id,
      institutionName: institution.name,
    };

    const token = jwt.sign(claims, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'component4-security-layer',
      audience: 'component4-api',
    });

    return {
      success: true,
      token,
      refreshToken: null,
      institution,
      session: buildSessionFromClaims(claims),
    };
  }

  async function loginCompanyVerifier({ companyId, email, password }) {
    const normalizedCompanyId = String(companyId ?? '').trim().toUpperCase();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const normalizedPassword = String(password ?? '');

    if (!normalizedCompanyId || !normalizedEmail || !normalizedPassword) {
      return { success: false, status: 400, error: 'companyId, email and password are required' };
    }

    const account = await authenticateCompanyUser({
      companyId: normalizedCompanyId,
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (!account || account.success === false) {
      return { success: false, status: 401, error: account?.error || 'Invalid company credentials' };
    }

    if (!account.user.emailVerified) {
      return {
        success: false,
        status: 403,
        error: 'Email not verified. Please verify your email before logging in.',
        requiresEmailVerification: true,
      };
    }

    const issued = await issueTokensForUser(account.user, 'company-credentials');

    return {
      success: true,
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      account: {
        company: {
          id: account.user.companyId,
          name: account.user.companyName,
          companyId: account.user.companyId,
          companyName: account.user.companyName,
        },
        user: account.user,
      },
      session: issued.session,
    };
  }

  async function signupCompanyAdmin({ companyId, companyName, adminName, adminEmail, adminPassword }) {
    const result = await registerCompanyAdmin({
      companyId,
      companyName,
      adminName,
      adminEmail,
      adminPassword,
    });

    if (!result.success) {
      return { ...result, status: result.status || 400 };
    }

    return {
      ...result,
      status: 201,
      message: 'Company signup successful. You can now sign in with the administrator account.',
    };
  }

  async function requestEmailVerification({ email }) {
    const user = await getUserByEmail(email);
    if (!user) {
      return { success: true, status: 200, message: 'If the account exists, a verification email has been queued.' };
    }

    const verification = await ensureEmailVerificationToken(user.email);
    if (!verification.success) {
      return { success: false, status: 400, error: verification.error };
    }

    await appendEmailOutbox({
      type: 'email_verification',
      to: user.email,
      subject: 'Verify your email',
      metadata: {
        companyId: user.companyId,
        userId: user.userId,
        token: verification.token,
        expiresAt: verification.expiresAt,
      },
    });

    await addAuditEvent('email_verification_requested', user.email, user.companyId, {
      reason: 'manual_request',
    });

    return {
      success: true,
      status: 200,
      message: 'Verification email queued.',
    };
  }

  async function confirmEmailVerification({ token }) {
    const result = await verifyEmailWithToken(token);
    if (!result.success) {
      return { ...result, status: 400 };
    }

    return {
      success: true,
      status: 200,
      user: result.user,
      message: 'Email verified successfully.',
    };
  }

  async function requestPasswordReset({ email }) {
    const user = await getUserByEmail(email);
    if (!user) {
      return { success: true, status: 200, message: 'If the account exists, a reset email has been queued.' };
    }

    const reset = await ensurePasswordResetToken(user.email);
    if (!reset.success) {
      return { success: false, status: 400, error: reset.error };
    }

    await appendEmailOutbox({
      type: 'password_reset',
      to: user.email,
      subject: 'Reset your password',
      metadata: {
        companyId: user.companyId,
        userId: user.userId,
        token: reset.token,
        expiresAt: reset.expiresAt,
      },
    });

    await addAuditEvent('password_reset_requested', user.email, user.companyId, {
      userId: user.userId,
    });

    return {
      success: true,
      status: 200,
      message: 'Password reset email queued.',
    };
  }

  async function confirmPasswordReset({ token, newPassword }) {
    const result = await resetPasswordWithToken(token, newPassword);
    if (!result.success) {
      return { ...result, status: 400 };
    }

    return {
      success: true,
      status: 200,
      user: result.user,
      message: 'Password reset complete.',
    };
  }

  async function getSessionProfile(token) {
    return authenticateToken(token);
  }

  async function resolveAdminActor(sessionToken) {
    const session = await authenticateToken(sessionToken);
    if (!session) {
      return { error: { success: false, status: 401, error: 'Unauthorized' } };
    }

    if (session.role !== 'admin') {
      return { error: { success: false, status: 403, error: 'Admin role is required' } };
    }

    return { session };
  }

  async function getAdminUsers(sessionToken) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return {
      success: true,
      users: await listCompanyUsers(actor.session.companyId),
      passwordPolicy: getPasswordPolicySummary(),
    };
  }

  async function createAdminUser({ sessionToken, email, name, role, password }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    const result = await createCompanyUser(actor.session, {
      email,
      name,
      role,
      password,
    });

    if (result.success) {
      await addAuditEvent('admin_user_created', actor.session.userEmail, actor.session.companyId, { userId: result.user.userId });
    }

    return result;
  }

  async function updateAdminUser({ sessionToken, email, name, role, password }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return updateCompanyUser(actor.session, email, {
      name,
      role,
      password,
    });
  }

  async function getAdminAuditEvents({ sessionToken, limit }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return {
      success: true,
      events: await listAuditEvents({
        companyId: actor.session.companyId,
        limit,
      }),
    };
  }

  async function registerAdminInstitution({ sessionToken, id, name, label, commitment }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return registerInstitution({
      id,
      name,
      label,
      commitment,
    });
  }

  async function verifyGradeRequest({ candidateId, moduleCode, claimedGrade, sessionToken, gradeProof, gradePublicSignals }) {
    const session = await authenticateToken(sessionToken);
    if (!session) {
      return { success: false, status: 401, error: 'Unauthorized' };
    }

    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const normalizedModuleCode = canonicalizeIdentifier(moduleCode);
    const normalizedClaimedGrade = String(claimedGrade ?? '').trim().toUpperCase();

    if (!normalizedCandidateId || !normalizedModuleCode || !normalizedClaimedGrade) {
      return { success: false, status: 400, error: 'Missing required academic verification fields' };
    }

    const checks = {
      recordFound: false,
      blockchainAnchorValid: false,
      ipfsDatasetValid: false,
      hashMatch: false,
      merkleProofValid: false,
      zkpValid: false,
    };
    const failure = (status, error, code) => ({
      success: false,
      status,
      result: 'INVALID',
      tampered: true,
      error,
      code,
      candidateId: normalizedCandidateId,
      moduleCode: normalizedModuleCode,
      checks,
    });

    let lookup;
    try {
      lookup = await lookupAnchoredRecord({ candidateId: normalizedCandidateId, moduleCode: normalizedModuleCode });
    } catch (error) {
      return failure(error.status === 404 ? 404 : 503, error.status === 404 ? 'Official record reference not found' : 'Component 1 lookup service is unavailable', error.status === 404 ? 'RECORD_NOT_FOUND' : 'COMPONENT1_LOOKUP_UNAVAILABLE');
    }

    let verificationDataset;
    try {
      const anchor = await fetchAnchoredMetadata(lookup.merkleRoot);
      const anchorRoot = normalizeMerkleRoot(anchor?.merkleRoot);
      const anchorCid = anchor?.ipfsCID || null;
      if (!anchor?.success || anchorRoot !== lookup.merkleRoot || !anchorCid || anchorCid !== lookup.ipfsCID) {
        return failure(409, 'Blockchain anchor does not match Component 1 record reference', 'BLOCKCHAIN_ANCHOR_MISMATCH');
      }
      checks.blockchainAnchorValid = true;

      const dataset = await fetchFinalizedDataset(lookup.merkleRoot);
      const blockchainRoot = normalizeMerkleRoot(dataset?.verificationSource?.blockchain?.merkleRoot || '');
      const dataRoot = normalizeMerkleRoot(dataset?.data?.merkleRoot || '');
      if (blockchainRoot !== anchorRoot || dataRoot !== anchorRoot) {
        return failure(409, 'Blockchain and IPFS dataset Merkle roots do not match', 'BLOCKCHAIN_IPFS_ROOT_MISMATCH');
      }
      const datasetCid = dataset?.verificationSource?.blockchain?.ipfsCID || dataset?.data?.ipfsCID || null;
      if (!datasetCid || datasetCid !== anchorCid) {
        return failure(409, 'IPFS dataset CID does not match the blockchain anchor', 'IPFS_CID_MISMATCH');
      }
      checks.ipfsDatasetValid = true;
      verificationDataset = {
        blockchainRoot,
        dataRoot,
        ipfsCID: lookup.ipfsCID,
        dataset,
        records: dataset?.data?.recordsWithHashes || dataset?.data?.records || dataset?.records || [],
        source: { merkleRoot: blockchainRoot, ipfsCID: lookup.ipfsCID, timestamp: dataset?.verificationSource?.blockchain?.timestamp || null, uploadedBy: dataset?.verificationSource?.blockchain?.uploadedBy || null },
      };
    } catch (error) {
      return failure(error.status || 503, 'Component 1 anchored dataset service is unavailable', 'COMPONENT1_DATA_UNAVAILABLE');
    }
    const recordIndex = verificationDataset.records.findIndex(
      (record) =>
        canonicalizeIdentifier(record.candidateId) === normalizedCandidateId &&
        canonicalizeIdentifier(record.moduleCode) === normalizedModuleCode,
    );

    if (recordIndex < 0) {
      return failure(404, 'Official record not found in the finalized dataset', 'RECORD_NOT_FOUND');
    }
    checks.recordFound = true;

    const record = verificationDataset.records[recordIndex];

    let officialProof;
    const merkleProofSource = 'component1-endpoint';
    try {
      officialProof = await fetchOfficialMerkleProof({
        merkleRoot: `0x${verificationDataset.blockchainRoot}`,
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
      });
    } catch (_error) {
      return failure(503, 'Component 1 Merkle-proof service is unavailable', 'COMPONENT1_MERKLE_UNAVAILABLE');
    }

    if (!officialProof?.success || !Array.isArray(officialProof.proof)) {
      return failure(502, 'Component 1 returned an invalid Merkle proof', 'INVALID_MERKLE_PROOF_RESPONSE');
    }

    const officialHash = normalizeMerkleRoot(officialProof?.record?.hash || record.hash || '');
    const submittedHash = sha256Hex(canonicalRecordString({
      candidateId: normalizedCandidateId,
      moduleCode: normalizedModuleCode,
      grade: normalizedClaimedGrade,
    }));
    const hashValid = submittedHash === officialHash;
    checks.hashMatch = hashValid;

    const officialProofRoot = normalizeMerkleRoot(officialProof.merkleRoot || verificationDataset.blockchainRoot);
    const proof = officialProof.proof;
    const proofFromEndpointValid = officialProof.proofVerified === true;
    const locallyReconstructedValid = verifyMerkleProof(officialHash, proof, officialProofRoot);
    const merkleValid =
      proofFromEndpointValid &&
      locallyReconstructedValid &&
      verificationDataset.blockchainRoot === verificationDataset.dataRoot &&
      officialProofRoot === verificationDataset.blockchainRoot;
    checks.merkleProofValid = merkleValid;

    const zkpRequired = String(process.env.REQUIRE_GRADE_ZKP || 'false').toLowerCase() === 'true';
    if (zkpRequired && (!gradeProof || !gradePublicSignals)) {
      return failure(400, 'A grade ZKP is required by verification policy', 'ZKP_PROOF_REQUIRED');
    }
    const zkpValid = gradeProof && gradePublicSignals
      ? await verifyProof({ proof: gradeProof, publicSignals: gradePublicSignals, keyPaths: gradeVerificationKeyPaths })
      : true;
    checks.zkpValid = zkpValid;

    const valid = checks.recordFound && checks.blockchainAnchorValid && checks.ipfsDatasetValid && checks.hashMatch && checks.merkleProofValid && checks.zkpValid;

    const response = {
      success: valid,
      status: 200,
      valid,
      result: valid ? 'VALID' : 'INVALID',
      tampered: !valid,
      verificationSource: {
        blockchain: {
          merkleRoot: verificationDataset.blockchainRoot,
          ipfsCID: verificationDataset.ipfsCID,
          timestamp: verificationDataset.source.timestamp,
          uploadedBy: verificationDataset.source.uploadedBy,
        },
      },
      claim: {
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
        claimedGrade: normalizedClaimedGrade,
      },
      checks,
    };

    try {
      await recordVerificationAttempt({
        session,
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
        claimedGrade: normalizedClaimedGrade,
        result: response,
      });
    } catch (error) {
      // The cryptographic decision is retained; server startup checks MongoDB
      // connectivity whenever MONGODB_URI is configured.
      console.error('Unable to persist Component 4 verification history:', error.message);
    }

    return response;
  }

  // Full-transcript verification deliberately returns no transcript data. It
  // validates every finalized leaf for the supplied candidate and exposes only
  // a binary decision through the API layer.
  async function verifyTranscriptRequest({ candidateId, sessionToken }) {
    const session = await authenticateToken(sessionToken);
    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const failure = (error) => ({ success: false, status: 200, valid: false, result: 'INVALID', error });
    if (!session || !normalizedCandidateId) return failure('Invalid verification request');

    try {
      const source = await readVerificationSource();
      if (!source.merkleRoot || !source.ipfsCID) return failure('Finalized anchor unavailable');
      const anchor = await fetchAnchoredMetadata(source.merkleRoot);
      const anchorRoot = normalizeMerkleRoot(anchor?.merkleRoot);
      if (!anchor?.success || anchorRoot !== source.merkleRoot || anchor.ipfsCID !== source.ipfsCID) {
        return failure('Blockchain anchor mismatch');
      }

      const dataset = await fetchFinalizedDataset(source.merkleRoot);
      const datasetRoot = normalizeMerkleRoot(dataset?.data?.merkleRoot || '');
      const datasetAnchorRoot = normalizeMerkleRoot(dataset?.verificationSource?.blockchain?.merkleRoot || '');
      const datasetCid = dataset?.verificationSource?.blockchain?.ipfsCID || dataset?.data?.ipfsCID || null;
      const records = Array.isArray(dataset?.data?.recordsWithHashes) ? dataset.data.recordsWithHashes : [];
      if (datasetRoot !== anchorRoot || datasetAnchorRoot !== anchorRoot || datasetCid !== anchor.ipfsCID) {
        return failure('Finalized dataset integrity mismatch');
      }

      const candidateRecords = records.filter((record) => canonicalizeIdentifier(record.candidateId) === normalizedCandidateId);
      if (candidateRecords.length === 0) return failure('Candidate not found');

      const allHashes = records.map((record) => normalizeMerkleRoot(record.hash));
      const valid = candidateRecords.every((record) => {
        const recordIndex = records.indexOf(record);
        const hash = normalizeMerkleRoot(record.hash);
        const canonicalHash = sha256Hex(canonicalRecordString({ candidateId: record.candidateId, moduleCode: record.moduleCode, grade: record.grade }));
        const proof = getMerkleProof(allHashes, recordIndex);
        return hash === canonicalHash && verifyMerkleProof(hash, proof, anchorRoot);
      });

      const result = { success: valid, status: 200, valid, result: valid ? 'VALID' : 'INVALID' };
      await recordVerificationAttempt({ session, candidateId: normalizedCandidateId, moduleCode: 'FULL_TRANSCRIPT', claimedGrade: 'NOT_DISCLOSED', result });
      return result;
    } catch (_error) {
      return failure('Transcript verification unavailable');
    }
  }

  function formatRootWithPrefix(rootValue) {
    const normalized = normalizeMerkleRoot(rootValue);
    return normalized ? `0x${normalized}` : null;
  }

  async function getMerkleProofForRecord({ merkleRoot, candidateId, moduleCode }) {
    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const normalizedModuleCode = canonicalizeIdentifier(moduleCode);
    const requestedRoot = normalizeMerkleRoot(merkleRoot);

    if (!requestedRoot || !normalizedCandidateId || !normalizedModuleCode) {
      return { success: false, status: 400, error: 'Missing required fields: merkleRoot, candidateId, moduleCode' };
    }

    const verificationDataset = await getOfficialVerificationDataset();
    const blockchainRoot = normalizeMerkleRoot(verificationDataset.blockchainRoot);
    const dataRoot = normalizeMerkleRoot(verificationDataset.dataRoot);

    if (requestedRoot !== blockchainRoot && requestedRoot !== dataRoot) {
      return { success: false, status: 404, error: 'Merkle root not found' };
    }

    const leafIndex = verificationDataset.records.findIndex(
      (record) =>
        canonicalizeIdentifier(record.candidateId) === normalizedCandidateId &&
        canonicalizeIdentifier(record.moduleCode) === normalizedModuleCode,
    );

    if (leafIndex < 0) {
      return { success: false, status: 404, error: 'Candidate or module not found in finalized dataset' };
    }

    const record = verificationDataset.records[leafIndex];
    const proof = getMerkleProof(verificationDataset.records.map((entry) => entry.hash), leafIndex);
    const proofVerified = verifyMerkleProof(record.hash, proof, blockchainRoot);

    return {
      success: true,
      status: 200,
      merkleRoot: formatRootWithPrefix(blockchainRoot),
      ipfsCID: verificationDataset.ipfsCID,
      record: {
        candidateId: record.candidateId,
        moduleCode: record.moduleCode,
        version: record.version,
        hash: normalizeMerkleRoot(record.hash),
      },
      leafIndex,
      proof,
      proofVerified,
    };
  }

  return {
    authenticateToken,
    refreshSessionTokens,
    createAdminUser,
    confirmEmailVerification,
    confirmPasswordReset,
    fetchFinalizedDataset,
    lookupAnchoredRecord,
    getAdminAuditEvents,
    getAdminUsers,
    getMerkleProofForRecord,
    getOfficialVerificationDataset,
    getSessionProfile,
    getTranscript,
    verifyTranscriptRequest,
    listCompanies,
    listInstitutions,
    loginCompanyVerifier,
    readVerificationSource,
    registerAdminInstitution,
    requestEmailVerification,
    requestPasswordReset,
    revokeToken,
    signupCompanyAdmin,
    updateAdminUser,
    verifyGradeRequest,
    verifyLoginProof,
  };
}

module.exports = {
  createVerificationService,
};
