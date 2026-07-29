import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import CandidateSearch from "../components/CandidateSearch";

import { getDashboard } from "../services/dashboardService";
import { logout } from "../utils/auth";

import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);

  const [selectedModule, setSelectedModule] = useState(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await getDashboard();

      setDashboard(data);
    } catch {
      logout();

      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();

    navigate("/login");
  };

  if (loading) {
    return <div className="dashboard-loading">Loading Dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Board of Examiners Dashboard</h1>

          <p>
            Welcome,
            <strong> {dashboard.username}</strong>
          </p>
        </div>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {!selectedModule ? (
        <>
          <section className="dashboard-intro">
            <h2>Your Assigned Modules</h2>

            <p>
              Select a module to begin reviewing and revising candidate results.
            </p>
          </section>

          <div className="module-grid">
            {dashboard.assignedModules.map((module) => (
              <div
                key={module}
                className="module-card"
                onClick={() => setSelectedModule(module)}
              >
                <h3>{module}</h3>

                <p>Click to Manage Results</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="dashboard-toolbar">
            <button
              className="back-btn"
              onClick={() => setSelectedModule(null)}
            >
              ← Back to Modules
            </button>

            <div className="current-module">
              Module : <strong>{selectedModule}</strong>
            </div>
          </div>

          <CandidateSearch moduleCode={selectedModule} />
        </>
      )}
    </div>
  );
}

export default Dashboard;