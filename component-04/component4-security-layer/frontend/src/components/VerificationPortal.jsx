import React, { useMemo, useState } from 'react';
import { generateLoginProof } from '../lib/zkp';
let activeSessionToken = null;

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(activeSessionToken ? { Authorization: `Bearer ${activeSessionToken}` } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include',
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function ResultBadge({ label, value }) {
  return (
    <div className="result-badge">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoginView({ onAuthenticated }) {
  const [institutionId, setInstitutionId] = useState('EMP001');
  const [credential, setCredential] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAuthenticate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const institutionPayload = await requestJson(`/api/auth/institutions/${institutionId}`);
      const proofPayload = await generateLoginProof(credential, institutionPayload.institution.commitment);

      const authPayload = await requestJson('/api/auth/zkp', {
        method: 'POST',
        body: JSON.stringify({
          institutionId,
          proof: proofPayload.proof,
          publicSignals: proofPayload.publicSignals,
          commitment: proofPayload.commitment,
        }),
      });

      onAuthenticated({
        institution: authPayload.institution,
        token: authPayload.token,
      });
    } catch (requestError) {
      setError(requestError.message || 'ZKP Authentication Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="verification-login-panel">
      <div className="portal-heading">
        <p className="eyebrow">ACADEMIC CREDENTIAL</p>
        <h1>VERIFICATION PORTAL</h1>
        <p className="portal-subtitle">
          Secure institutional verification using Zero-Knowledge Proof authentication
        </p>
      </div>

      <form className="portal-form" onSubmit={handleAuthenticate}>
        <label>
          Institution ID
          <input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="EMP001" />
        </label>

        <label>
          ZKP Credential
          <input
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            placeholder="Enter private credential"
            type="password"
          />
        </label>

        {error ? <div className="portal-error">{error}</div> : null}

        <button type="submit" disabled={loading} className="primary-button">
          {loading ? 'Authenticating...' : 'Authenticate with ZKP'}
        </button>
      </form>

      <p className="privacy-note">Your private credential is never transmitted to the verification server.</p>
    </section>
  );
}

function AuthenticatedView({ institution, onLogout }) {
  const [candidateId, setCandidateId] = useState('IT001');
  const [moduleCode, setModuleCode] = useState('SE3050');
  const [claimedGrade, setClaimedGrade] = useState('A');
  const [transcript, setTranscript] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [error, setError] = useState('');

  const transcriptRows = useMemo(() => transcript?.transcript || [], [transcript]);

  async function loadTranscript() {
    setLoadingTranscript(true);
    setError('');

    try {
      const payload = await requestJson(`/api/verify/transcript/${encodeURIComponent(candidateId)}`);
      setTranscript(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function verifyGrade() {
    setLoadingVerification(true);
    setError('');

    try {
      const payload = await requestJson('/api/verify/grade', {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          moduleCode,
          claimedGrade,
        }),
      });

      setVerificationResult(payload);
    } catch (requestError) {
      setError(requestError.message);
      setVerificationResult(null);
    } finally {
      setLoadingVerification(false);
    }
  }

  return (
    <section className="verification-portal-panel">
      <header className="authenticated-banner">
        <div>
          <p className="eyebrow success">ZKP AUTHENTICATED</p>
          <h2>{institution?.name || institution?.id || 'Institution'}</h2>
          <p>{institution?.label || 'Authenticated verification session'}</p>
        </div>

        <button type="button" className="secondary-button" onClick={onLogout}>
          Logout
        </button>
      </header>

      <div className="portal-grid">
        <div className="portal-card">
          <h3>Verification Inputs</h3>
          <label>
            Candidate ID
            <input value={candidateId} onChange={(event) => setCandidateId(event.target.value)} />
          </label>
          <label>
            Module Code
            <input value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} />
          </label>
          <label>
            Claimed Grade
            <input value={claimedGrade} onChange={(event) => setClaimedGrade(event.target.value)} />
          </label>

          <div className="button-row">
            <button type="button" className="primary-button" onClick={loadTranscript} disabled={loadingTranscript}>
              {loadingTranscript ? 'Loading Transcript...' : 'Full Transcript Verification'}
            </button>
            <button type="button" className="primary-button" onClick={verifyGrade} disabled={loadingVerification}>
              {loadingVerification ? 'Verifying...' : 'Single Grade Verification'}
            </button>
          </div>
        </div>

        <div className="portal-card">
          <h3>Verification Status</h3>
          {verificationResult ? (
            <div className="verification-result">
              <p className={verificationResult.valid ? 'success-text' : 'error-text'}>
                {verificationResult.valid ? '✓ VERIFICATION SUCCESSFUL' : '✕ VERIFICATION FAILED'}
              </p>
              <ResultBadge label="Candidate ID" value={verificationResult.record?.candidateId || candidateId} />
              <ResultBadge label="Module" value={verificationResult.record?.moduleCode || moduleCode} />
              <ResultBadge label="Cryptographic Hash" value={verificationResult.checks?.cryptographicHash || 'PENDING'} />
              <ResultBadge label="Merkle Proof" value={verificationResult.checks?.merkleProof || 'PENDING'} />
              <ResultBadge label="Blockchain Anchor" value={verificationResult.checks?.blockchainAnchor || 'PENDING'} />
              <ResultBadge label="ZKP Verification" value={verificationResult.checks?.zkpVerification || 'PENDING'} />
              <p className="result-summary">
                {verificationResult.valid ? 'ACADEMIC RESULT AUTHENTIC' : 'RESULT: INVALID / TAMPERED'}
              </p>
            </div>
          ) : (
            <p className="muted-copy">Run a verification to see cryptographic status.</p>
          )}
        </div>
      </div>

      {error ? <div className="portal-error">{error}</div> : null}

      {transcript ? (
        <div className="portal-card transcript-card">
          <h3>Full Transcript Verification</h3>
          <div className="source-strip">
            <span>Merkle Root: {transcript.verificationSource?.blockchain?.merkleRoot || 'Unavailable'}</span>
            <span>CID: {transcript.verificationSource?.blockchain?.ipfsCID || 'Unavailable'}</span>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Module</th>
                  <th>Grade</th>
                  <th>Hash</th>
                  <th>GPA</th>
                </tr>
              </thead>
              <tbody>
                {transcriptRows.map((row) => (
                  <tr key={`${row.candidateId}-${row.moduleCode}-${row.hash}`}>
                    <td>{row.candidateId}</td>
                    <td>{row.moduleCode}</td>
                    <td>{row.grade}</td>
                    <td>{row.hash}</td>
                    <td>{row.gpa ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function VerificationPortal() {
  const [session, setSession] = useState(null);

  async function handleLogout() {
    try {
      await requestJson('/api/auth/logout', { method: 'POST', body: JSON.stringify({ token: session?.token }) });
    } catch (_error) {
      // Ignore logout transport failures and clear the local session.
    }

    setSession(null);
  }

  return session ? (
    <AuthenticatedView institution={session.institution} onLogout={handleLogout} />
  ) : (
    <LoginView onAuthenticated={setSession} />
  );
}/* eslint-disable react/prop-types */

import React, { useMemo, useState } from 'react';
import { requestJson } from '../lib/api';
import { generateLoginProof } from '../lib/zkp';
import './VerificationPortal.css';

const MODULE_OPTIONS = ['SE3030', 'SE4010', 'SE4020'];
const GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'E', 'F'];

function getActionLabel(requestPhase, portalMode) {
  if (requestPhase === 'verification-loading') {
    return 'Verifying...';
  }

  return portalMode === 'grade' ? 'Verify Grade' : 'Load Transcript';
}

function LoginView({
  authLabel,
  authStatus,
  errorMessage,
  institutionId,
  onAuthenticate,
  onCredentialChange,
  onInstitutionChange,
  successMessage,
  credential,
}) {
  return (
    <main className="vp-card vp-auth-card">
      <div className="vp-brand-block">
        <div className="vp-brand-mark">ZKP</div>
        <div>
          <p className="vp-eyebrow">Component 4</p>
          <h1>Academic Credential Verification Portal</h1>
          <p className="vp-subtitle">
            Secure institutional verification using zero-knowledge proof authentication.
          </p>
        </div>
      </div>

      <form className="vp-form" onSubmit={onAuthenticate}>
        <label>
          <span>Institution ID</span>
          <input
            value={institutionId}
            onChange={(event) => onInstitutionChange(event.target.value.toUpperCase())}
            placeholder="EMP001"
            autoComplete="organization"
            required
          />
        </label>

        <label>
          <span>ZKP Credential</span>
          <input
            type="password"
            value={credential}
            onChange={(event) => onCredentialChange(event.target.value)}
            placeholder="Enter private institution secret"
            autoComplete="current-password"
            required
          />
        </label>

        <button className="vp-primary-button" type="submit" disabled={authStatus === 'loading'}>
          {authLabel}
        </button>
      </form>

      <div className="vp-info-panel">
        <p className="vp-info-title">Privacy</p>
        <p>Your private credential is never sent to the verification server.</p>
      </div>

      {successMessage ? <div className="vp-alert success">{successMessage}</div> : null}
      {errorMessage ? <div className="vp-alert error">{errorMessage}</div> : null}
    </main>
  );
}

function AuthenticatedView({
  cgpa,
  candidateId,
  claimedGrade,
  errorMessage,
  institution,
  loadTranscript,
  moduleCode,
  onCandidateChange,
  onGradeChange,
  onLogout,
  onPortalModeChange,
  onModuleCodeChange,
  portalMode,
  requestPhase,
  transcript,
  verificationResult,
  verifyGrade,
}) {
  const actionLabel = getActionLabel(requestPhase, portalMode);

  const triggerAction = portalMode === 'grade' ? verifyGrade : loadTranscript;

  return (
    <main className="vp-card vp-portal-card">
      <header className="vp-portal-header">
        <div>
          <p className="vp-eyebrow">ZKP Authenticated</p>
          <h1>Verification Portal</h1>
          <p className="vp-subtitle">Institution: {institution?.institutionName || 'Authenticated verifier'}</p>
        </div>
        <button className="vp-secondary-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </header>

      <section className="vp-mode-switch">
        <button
          type="button"
          className={portalMode === 'transcript' ? 'active' : ''}
          onClick={() => onPortalModeChange('transcript')}
        >
          Full Transcript Verification
        </button>
        <button
          type="button"
          className={portalMode === 'grade' ? 'active' : ''}
          onClick={() => onPortalModeChange('grade')}
        >
          Single Grade Verification
        </button>
      </section>

      <section className="vp-form-grid">
        <label>
          <span>Candidate ID</span>
          <input
            value={candidateId}
            onChange={(event) => onCandidateChange(event.target.value.toUpperCase())}
            placeholder="IT22276346"
          />
        </label>

        {portalMode === 'grade' ? (
          <>
              <label>
              <span>Module Code</span>
              <select value={moduleCode} onChange={(event) => onModuleCodeChange(event.target.value)}>
                {MODULE_OPTIONS.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Claimed Grade</span>
              <select value={claimedGrade} onChange={(event) => onGradeChange(event.target.value)}>
                {GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </section>

      <div className="vp-actions">
        <button
          type="button"
          className="vp-primary-button"
          onClick={triggerAction}
          disabled={requestPhase === 'verification-loading'}
        >
          {actionLabel}
        </button>
      </div>

      {verificationResult ? (
        <section className={`vp-result-panel ${verificationResult.status}`}>
          <div className="vp-result-heading">
            <span>{verificationResult.status === 'valid' ? '✓' : '✕'}</span>
            <div>
              <h2>{verificationResult.headline}</h2>
              <p>{verificationResult.detail}</p>
            </div>
          </div>

          {portalMode === 'grade' && verificationResult.result ? (
            <div className="vp-status-grid">
              <div><strong>Cryptographic Proof</strong><span>{verificationResult.result.cryptographicProof}</span></div>
              <div><strong>Merkle Proof</strong><span>{verificationResult.result.merkleProof}</span></div>
              <div><strong>Blockchain Anchor</strong><span>{verificationResult.result.blockchainAnchor}</span></div>
              <div><strong>ZKP Verification</strong><span>{verificationResult.result.zkpVerification}</span></div>
              <div><strong>Result</strong><span>{verificationResult.result.overall}</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {transcript.length > 0 ? (
        <section className="vp-table-panel">
          <div className="vp-table-heading">
            <h2>Verified Transcript</h2>
            <p>CGPA {cgpa}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Credits</th>
                <th>Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transcript.map((row) => (
                <tr key={`${row.moduleCode}-${row.semester}`}>
                  <td>{row.moduleCode}</td>
                  <td>{row.credits}</td>
                  <td>{row.grade}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {errorMessage ? <div className="vp-alert error">{errorMessage}</div> : null}
    </main>
  );
}

function VerificationPortal() {
  const [authStatus, setAuthStatus] = useState('idle');
  const [portalMode, setPortalMode] = useState('idle');
  const [institutionId, setInstitutionId] = useState('EMP001');
  const [credential, setCredential] = useState('');
  const [institution, setInstitution] = useState(null);
  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [candidateId, setCandidateId] = useState('IT22276346');
  const [moduleCode, setModuleCode] = useState('SE3030');
  const [claimedGrade, setClaimedGrade] = useState('A');
  const [transcript, setTranscript] = useState([]);
  const [cgpa, setCgpa] = useState('0.00');
  const [verificationResult, setVerificationResult] = useState(null);
  const [requestPhase, setRequestPhase] = useState('idle');

  const isAuthenticated = Boolean(token && institution);

  const authLabel = useMemo(() => {
    if (authStatus === 'loading') {
      return 'Authenticating...';
    }

    return isAuthenticated ? 'Authenticated' : 'Authenticate with ZKP';
  }, [authStatus, isAuthenticated]);

  const resetFeedback = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setVerificationResult(null);
  };

  const handleAuthenticate = async (event) => {
    event.preventDefault();
    setAuthStatus('loading');
    resetFeedback();

    try {
      const institutionResponse = await requestJson(`/api/auth/institutions/${institutionId}`);
      const resolvedInstitution = institutionResponse.institution;
      const proof = await generateLoginProof({
        secret: credential,
        commitment: resolvedInstitution.commitment,
      });

      const authResponse = await requestJson('/api/auth/zkp', {
        method: 'POST',
        body: {
          institutionId: resolvedInstitution.institutionId,
          proof: proof.proof,
          publicSignals: proof.publicSignals,
        },
      });

      setInstitution(authResponse.institution);
      setToken(authResponse.token);
      setSuccessMessage(`ZKP authentication successful for ${authResponse.institution.institutionName}.`);
      setAuthStatus('authenticated');
      setPortalMode('transcript');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(error.message || 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await requestJson('/api/auth/logout', {
          method: 'POST',
          token,
        });
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    }

    setToken('');
    setInstitution(null);
    setAuthStatus('idle');
    setPortalMode('idle');
    setTranscript([]);
    setCgpa('0.00');
    setVerificationResult(null);
    setSuccessMessage('');
    setErrorMessage('');
    setCredential('');
  };

  const loadTranscript = async () => {
    setRequestPhase('verification-loading');
    resetFeedback();

    try {
      const response = await requestJson(`/api/verify/transcript/${candidateId}`, { token });
      setTranscript(response.transcript || []);
      setCgpa(String(response.cgpa ?? '0.00'));
      setVerificationResult({
        status: 'valid',
        headline: 'Transcript verified',
        detail: `${response.candidateName} transcript anchored by CID ${response.datasetCid}.`,
      });
      setRequestPhase('valid');
    } catch (error) {
      setVerificationResult({
        status: 'invalid',
        headline: 'Transcript verification failed',
        detail: error.message || 'Unable to verify transcript',
      });
      setRequestPhase('invalid');
    }
  };

  const verifyGrade = async () => {
    setRequestPhase('verification-loading');
    resetFeedback();

    try {
      const response = await requestJson('/api/verify/grade', {
        method: 'POST',
        token,
        body: {
          candidateId,
          moduleCode,
          claimedGrade,
        },
      });

      const isValid = response.overall === 'AUTHENTIC';
      setVerificationResult({
        status: isValid ? 'valid' : 'invalid',
        headline: isValid ? 'Verification successful' : 'Verification failed',
        detail: isValid
          ? `Candidate ${response.candidateId} / ${response.moduleCode} is authenticated.`
          : 'The submitted claim does not match the anchored record.',
        result: response,
      });
      setRequestPhase(isValid ? 'valid' : 'invalid');
    } catch (error) {
      setVerificationResult({
        status: 'error',
        headline: 'Verification error',
        detail: error.message || 'Unable to verify grade',
      });
      setRequestPhase('error');
    }
  };

  const handlePortalModeChange = (nextMode) => {
    setPortalMode(nextMode);
    setVerificationResult(null);
    setTranscript([]);
  };

  if (!isAuthenticated) {
    return (
      <div className="vp-shell">
        <div className="vp-grid-bg" />
        <LoginView
          authLabel={authLabel}
          authStatus={authStatus}
          credential={credential}
          errorMessage={errorMessage}
          institutionId={institutionId}
          onAuthenticate={handleAuthenticate}
          onCredentialChange={setCredential}
          onInstitutionChange={setInstitutionId}
          successMessage={successMessage}
        />
      </div>
    );
  }

  return (
    <div className="vp-shell">
      <div className="vp-grid-bg" />
      <AuthenticatedView
        cgpa={cgpa}
        candidateId={candidateId}
        claimedGrade={claimedGrade}
      activeSessionToken = authPayload.token;
        errorMessage={errorMessage}
        institution={institution}
        loadTranscript={loadTranscript}
        moduleCode={moduleCode}
        onCandidateChange={setCandidateId}
        onGradeChange={setClaimedGrade}
        onLogout={handleLogout}
        onModuleCodeChange={setModuleCode}
        onPortalModeChange={handlePortalModeChange}
        portalMode={portalMode}
        requestPhase={requestPhase}
        transcript={transcript}
        verificationResult={verificationResult}
        verifyGrade={verifyGrade}
    activeSessionToken = null;
      />
    </div>
  );
}

export default VerificationPortal;