import React, { useMemo, useState } from 'react';
import { generateLoginProof } from '../lib/zkp-clean';
import './VerificationPortal.css';

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

function VerificationTimeline({ verificationResult }) {
  const steps = [
    {
      label: 'Claim intake',
      detail: 'Candidate ID, module code, and claimed grade captured for verification.',
      state: verificationResult ? 'complete' : 'pending',
    },
    {
      label: 'Dataset anchor',
      detail: verificationResult
        ? `Blockchain anchor ${verificationResult.checks?.blockchainAnchor || 'PENDING'}`
        : 'Awaiting anchored dataset lookup.',
      state: verificationResult
        ? verificationResult.checks?.blockchainAnchor === 'VERIFIED'
          ? 'complete'
          : 'error'
        : 'pending',
    },
    {
      label: 'Cryptographic hash',
      detail: verificationResult
        ? `Hash validation ${verificationResult.checks?.cryptographicHash || 'PENDING'}`
        : 'Awaiting canonical hash comparison.',
      state: verificationResult
        ? verificationResult.checks?.cryptographicHash === 'VALID'
          ? 'complete'
          : 'error'
        : 'pending',
    },
    {
      label: 'Merkle membership',
      detail: verificationResult
        ? `Membership check ${verificationResult.checks?.merkleProof || 'PENDING'}`
        : 'Awaiting finalized dataset proof evaluation.',
      state: verificationResult
        ? verificationResult.checks?.merkleProof === 'VALID'
          ? 'complete'
          : 'error'
        : 'pending',
    },
    {
      label: 'Final decision',
      detail: verificationResult
        ? verificationResult.valid
          ? 'Anchored academic result confirmed as authentic.'
          : 'Submitted claim marked invalid or tampered.'
        : 'Awaiting verification request.',
      state: verificationResult ? (verificationResult.valid ? 'complete' : 'error') : 'pending',
    },
  ];

  return (
    <div className="timeline-card">
      <div className="timeline-card-header">
        <span>Verification Timeline</span>
        <strong>Execution Trace</strong>
      </div>
      <div className="timeline-list">
        {steps.map((step) => (
          <div key={step.label} className={`timeline-step ${step.state}`}>
            <div className="timeline-dot" />
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
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

      activeSessionToken = authPayload.token;
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
    <section className="verification-login-panel premium-login-panel">
      <div className="premium-login-grid">
        <div className="premium-hero">
          <p className="eyebrow">Academic Credential</p>
          <h1>Verification Portal</h1>
          <p className="portal-subtitle hero-copy">
            Secure institutional verification for decentralized academic records using Zero-Knowledge authentication,
            anchored dataset validation, and transcript integrity checks.
          </p>

          <div className="portal-highlight-strip">
            <div className="highlight-pill">ZKP Institutional Access</div>
            <div className="highlight-pill">Blockchain Anchored Merkle Root</div>
            <div className="highlight-pill">IPFS Finalized Dataset Retrieval</div>
          </div>

          <div className="hero-stat-grid">
            <div className="hero-stat-card">
              <span>Security Layer</span>
              <strong>Component 4</strong>
            </div>
            <div className="hero-stat-card">
              <span>Verification Model</span>
              <strong>ZKP + Merkle + Hash</strong>
            </div>
            <div className="hero-stat-card">
              <span>Intended Users</span>
              <strong>Employers / Institutions</strong>
            </div>
          </div>
        </div>

        <div className="premium-auth-card">
          <div className="auth-card-topline">
            <span>Restricted Verification Access</span>
            <strong>Authenticate with ZKP</strong>
          </div>

          <form className="portal-form portal-form-stacked" onSubmit={handleAuthenticate}>
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

            <button type="submit" disabled={loading} className="primary-button auth-submit-button">
              {loading ? 'Authenticating...' : 'Authenticate with ZKP'}
            </button>
          </form>

          <p className="privacy-note">Your private credential is never transmitted to the verification server.</p>

          <div className="portal-footnote-grid compact-footnotes">
            <div className="footnote-card">
              <span>Authentication</span>
              <strong>Institution-only secure access</strong>
            </div>
            <div className="footnote-card">
              <span>Verification</span>
              <strong>Hash, Merkle root, and transcript integrity checks</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthenticatedView({ institution, onLogout }) {
  const [portalMode, setPortalMode] = useState('grade');
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
      const transcriptPayload = transcript || (await requestJson(`/api/verify/transcript/${encodeURIComponent(candidateId)}`));
      const record = transcriptPayload.transcript?.find(
        (entry) =>
          entry.candidateId?.toUpperCase() === candidateId.trim().toUpperCase() &&
          entry.moduleCode?.toUpperCase() === moduleCode.trim().toUpperCase(),
      );

      const payload = await requestJson('/api/verify/grade', {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          moduleCode,
          claimedGrade,
          ...(record
            ? {
                gradeProof: null,
                gradePublicSignals: null,
              }
            : {}),
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

        <div className="header-actions">
          <div className="session-chip">Secure verification session active</div>
          <button type="button" className="secondary-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-strip">
        <div className="dashboard-stat-card">
          <span>Authentication State</span>
          <strong>ZKP Authenticated</strong>
        </div>
        <div className="dashboard-stat-card">
          <span>Verification Channels</span>
          <strong>Hash, Merkle, Dataset Anchor</strong>
        </div>
        <div className="dashboard-stat-card">
          <span>Access Scope</span>
          <strong>Transcript and Grade Validation</strong>
        </div>
      </div>

      <div className="workspace-toolbar">
        <div className="workspace-copy">
          <span>Verification Workspace</span>
          <strong>
            {portalMode === 'grade' ? 'Single Grade Validation' : 'Full Transcript Review'}
          </strong>
        </div>
        <div className="mode-toggle-group">
          <button
            type="button"
            className={portalMode === 'grade' ? 'mode-toggle active' : 'mode-toggle'}
            onClick={() => setPortalMode('grade')}
          >
            Single Grade
          </button>
          <button
            type="button"
            className={portalMode === 'transcript' ? 'mode-toggle active' : 'mode-toggle'}
            onClick={() => setPortalMode('transcript')}
          >
            Full Transcript
          </button>
        </div>
      </div>

      <div className="portal-grid">
        <div className="portal-card">
          <h3>{portalMode === 'grade' ? 'Verification Inputs' : 'Transcript Retrieval'}</h3>
          <p className="card-intro">
            {portalMode === 'grade'
              ? 'Validate a single academic claim using the anchored dataset, cryptographic hash, and Merkle membership checks.'
              : 'Load the finalized transcript for the selected candidate from the anchored academic dataset.'}
          </p>
          <label>
            Candidate ID
            <input value={candidateId} onChange={(event) => setCandidateId(event.target.value)} />
          </label>

          {portalMode === 'grade' ? (
            <>
              <label>
                Module Code
                <input value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} />
              </label>
              <label>
                Claimed Grade
                <input value={claimedGrade} onChange={(event) => setClaimedGrade(event.target.value)} />
              </label>
            </>
          ) : null}

          <div className="input-helper-panel">
            <span>Verification Note</span>
            <p>
              {portalMode === 'grade'
                ? 'Use the candidate ID, module code, and employer-submitted grade to test academic authenticity.'
                : 'Transcript review retrieves all finalized records and shows anchored academic entries for the chosen candidate.'}
            </p>
          </div>

          <div className="button-row">
            <button type="button" className="secondary-button" onClick={loadTranscript} disabled={loadingTranscript}>
              {loadingTranscript ? 'Loading Transcript...' : 'Full Transcript Verification'}
            </button>
            {portalMode === 'grade' ? (
              <button type="button" className="primary-button" onClick={verifyGrade} disabled={loadingVerification}>
                {loadingVerification ? 'Verifying...' : 'Single Grade Verification'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="portal-card">
          <h3>{portalMode === 'grade' ? 'Verification Status' : 'Verification Overview'}</h3>
          {portalMode === 'grade' && verificationResult ? (
            <div className={`verification-result ${verificationResult.valid ? 'is-valid' : 'is-invalid'}`}>
              <div className="result-banner">
                <p className={verificationResult.valid ? 'success-text' : 'error-text'}>
                  {verificationResult.valid ? '✓ VERIFICATION SUCCESSFUL' : '✕ VERIFICATION FAILED'}
                </p>
                <p className="status-caption">
                  {verificationResult.valid
                    ? 'The submitted academic claim is consistent with the anchored finalized dataset.'
                    : 'The submitted academic claim is inconsistent with the anchored finalized dataset.'}
                </p>
              </div>
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
            <div className="empty-state-card">
              <strong>{portalMode === 'grade' ? 'Awaiting Verification Request' : 'Transcript Retrieval Ready'}</strong>
              <p className="muted-copy">
                {portalMode === 'grade'
                  ? 'Run a grade verification to display cryptographic validation results.'
                  : 'Run transcript verification to load anchored academic records and institutional summary data.'}
              </p>
            </div>
          )}

          <VerificationTimeline verificationResult={verificationResult} />
        </div>
      </div>

      {error ? <div className="portal-error">{error}</div> : null}

      {transcript ? (
        <div className="portal-card transcript-card">
          <div className="transcript-summary-grid">
            <div className="transcript-summary-card">
              <span>Candidate</span>
              <strong>{candidateId}</strong>
            </div>
            <div className="transcript-summary-card">
              <span>Records</span>
              <strong>{transcriptRows.length}</strong>
            </div>
            <div className="transcript-summary-card">
              <span>Calculated GPA</span>
              <strong>{transcript.gpa != null ? transcript.gpa.toFixed(2) : 'N/A'}</strong>
            </div>
            <div className="transcript-summary-card">
              <span>Dataset Status</span>
              <strong>{transcript.verificationSource?.blockchain?.merkleRoot ? 'Anchored' : 'Unavailable'}</strong>
            </div>
          </div>

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

    activeSessionToken = null;
    setSession(null);
  }

  return (
    <div className="vp-shell">
      <div className="vp-grid-bg" />
      {session ? (
        <AuthenticatedView institution={session.institution} onLogout={handleLogout} />
      ) : (
        <LoginView onAuthenticated={setSession} />
      )}
    </div>
  );
}
