import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import CandidateSearch from "../components/CandidateSearch";

import { getDashboard } from "../services/dashboardService";
import { logout } from "../utils/auth";
import { downloadModuleExcel } from "../services/exportService";

import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  // ==========================================
  // LOAD DASHBOARD
  // ==========================================

  const loadDashboard = async () => {
    try {
      const data = await getDashboard();

      setDashboard(data);
    } catch (error) {
      console.error("Failed to load dashboard:", error);

      logout();
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ==========================================
  // DOWNLOAD EXCEL
  // ==========================================

  const handleDownloadExcel = async () => {
    if (!selectedModule) return;

    try {
      setExporting(true);

      await downloadModuleExcel(selectedModule);
    } catch (error) {
      console.error("Excel download failed:", error);

      alert(error.response?.data?.message || "Failed to download Excel file.");
    } finally {
      setExporting(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-loading__spinner" />
        <span>Loading Dashboard...</span>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  return (
    <div className="dashboard">
      {/* ======================================
          HEADER
          ====================================== */}

      <header className="dashboard-header">
        <div className="dashboard-header__content">
          <div className="dashboard-header__info">
            <div className="dashboard-header__mark">BOE</div>

            <div>
              <h1>Board of Examiners Dashboard</h1>

              <p>
                Welcome,
                <strong> {dashboard.username}</strong>
              </p>
            </div>
          </div>

          <button className="logout-btn" onClick={handleLogout}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      {/* ======================================
          MAIN CONTENT
          ====================================== */}

      <main className="dashboard-content">
        {!selectedModule ? (
          <>
            {/* ==================================
                MODULE INTRO
                ================================== */}

            <section className="dashboard-intro">
              <span className="dashboard-intro__eyebrow">BOE WORKSPACE</span>

              <h2>Your Assigned Modules</h2>

              <p>
                Select a module to begin reviewing and revising candidate
                results.
              </p>
            </section>

            {/* ==================================
                MODULE CARDS
                ================================== */}

            <div className="module-grid">
              {dashboard.assignedModules.map((module) => (
                <div
                  key={module}
                  className="module-card"
                  onClick={() => setSelectedModule(module)}
                >
                  <div className="module-card__top">
                    <div className="module-card__icon">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M4 4h16v16H4z" />
                        <path d="M8 8h8" />
                        <path d="M8 12h8" />
                        <path d="M8 16h5" />
                      </svg>
                    </div>

                    <span className="module-card__arrow">→</span>
                  </div>

                  <h3>{module}</h3>

                  <p>Review and manage candidate results</p>

                  <div className="module-card__footer">
                    <span>Open Module</span>

                    <span>→</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ==================================
                MODULE TOOLBAR
                ================================== */}

            <div className="dashboard-toolbar">
              <button
                className="back-btn"
                onClick={() => setSelectedModule(null)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />

                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Modules
              </button>

              <div className="current-module">
                <span className="current-module__label">MODULE</span>

                <strong>{selectedModule}</strong>
              </div>

              <button
                className="download-excel-btn"
                onClick={handleDownloadExcel}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <span className="download-spinner" />
                    Generating...
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />

                      <polyline points="7 10 12 15 17 10" />

                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Excel
                  </>
                )}
              </button>
            </div>

            {/* ==================================
                CANDIDATE SEARCH
                ================================== */}

            <CandidateSearch moduleCode={selectedModule} />
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
