import React, { useState } from 'react';
import Login from './components/Login';
import LecturerPortal from './components/LecturerPortal';
import VerificationPortal from './components/VerificationPortal';
import './App.css';

function App() {
  const [appMode, setAppMode] = useState('landing');
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (userData) => setUser(userData);
  const handleLogout = () => {
    setUser(null);
    setAppMode('landing');
  };

  if (appMode === 'landing') {
    return (
      <div className="landing-container">
        <div className="landing-logo">💠</div>
        <h1 className="landing-title">Silent Bridge</h1>
        <p className="landing-subtitle">
          Decentralized Academic Verification System. <br />Select your gateway to continue.
        </p>

        <div className="gateway-grid">
          <button className="gateway-card" onClick={() => setAppMode('employer')}>
            <div className="gateway-icon">🏢</div>
            <h3>Corporate Verifier</h3>
            <p>Public portal for employers to instantly query and verify transcripts.</p>
          </button>

          <button className="gateway-card" onClick={() => setAppMode('academic')}>
            <div className="gateway-icon">🎓</div>
            <h3>Academic Staff</h3>
            <p>Secure SSO login for data ingestion and private ledger sealing.</p>
          </button>
        </div>
      </div>
    );
  }

  if (appMode === 'employer') {
    return (
      <div className="portal-wrapper">
        <nav className="top-nav">
          <div className="nav-logo"><span>💠</span> Corporate Verification Access</div>
          <button onClick={() => setAppMode('landing')} className="nav-btn">← Return to Gateway</button>
        </nav>
        <VerificationPortal />
      </div>
    );
  }

  if (appMode === 'academic') {
    if (!user) {
      return (
        <div className="auth-wrapper">
          <button onClick={() => setAppMode('landing')} className="back-btn">← Return to Gateway</button>
          <Login onLoginSuccess={handleLoginSuccess} />
        </div>
      );
    }

    return (
      <div className="portal-wrapper">
        <nav className="top-nav">
          <div className="nav-logo"><span>💠</span> Silent Bridge Ingestion</div>
          <div className="nav-user">
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-role">{user.role}</span>
            </div>
            <button className="nav-btn logout" onClick={handleLogout}>Logout</button>
          </div>
        </nav>
        <LecturerPortal user={user} />
      </div>
    );
  }
}

export default App;