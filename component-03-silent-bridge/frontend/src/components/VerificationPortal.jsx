import React, { useState } from 'react';
import axios from 'axios';
import './VerificationPortal.css';

const GRADE_POINTS = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'E': 0.0
};

export default function VerificationPortal() {
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('idle');
  const [records, setRecords] = useState([]);
  const [cgpa, setCgpa] = useState(0);

  const handleVerification = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;

    setStatus('loading');
    setRecords([]);
    setCgpa(0);

    try {
      const response = await axios.get(`http://localhost:5000/api/verify/${studentId}`);
      const fetchedRecords = response.data.records;
      setRecords(fetchedRecords);
      calculateOffChainGPA(fetchedRecords);
      setStatus('success');
    } catch (error) {
      setStatus('error');
    }
  };

  const calculateOffChainGPA = (verifiedRecords) => {
    let totalQualityPoints = 0;
    let totalCredits = 0;

    verifiedRecords.forEach(record => {
      const grade = record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade'];
      const credits = parseFloat(record.gradingData['Credits'] || 0);

      if (grade && GRADE_POINTS[grade.toUpperCase()] !== undefined && credits > 0) {
        totalQualityPoints += (GRADE_POINTS[grade.toUpperCase()] * credits);
        totalCredits += credits;
      }
    });

    setCgpa(totalCredits > 0 ? (totalQualityPoints / totalCredits).toFixed(2) : '0.00');
  };

  return (
    <div className="vp-container">
      <div className="vp-content">

        <div className="vp-header">
          <h1>Corporate Verification Portal</h1>
          <p>Trustless Off-Chain GPA Engine & Audit Trail</p>
        </div>

        <form className="vp-search" onSubmit={handleVerification}>
          <input
            type="text"
            placeholder="Enter Candidate ID (e.g., IT22061348)"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
            required
          />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? <div className="spinner"></div> : 'Verify Cryptographic Proof'}
          </button>
        </form>

        {status === 'error' && (
          <div className="vp-alert error">
            ❌ Invalid Candidate ID or no cryptographic records found in the ledger.
          </div>
        )}

        {status === 'success' && (
          <div className="vp-dashboard">
            <div className="gpa-widget">
              <h2>Verified Cumulative GPA</h2>
              <div className="gpa-score">{cgpa}</div>
              <p>Calculated dynamically off-chain using immutable ledger data.</p>
            </div>

            <div className="ledger-history">
              <h3>Cryptographic Ledger History</h3>
              <div className="records-grid">
                {records.map((record, index) => {
                  const finalGrade = record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade'] || 'N/A';
                  return (
                    <div key={index} className={`record-card ${record.isRecorrection ? 'recorrection' : 'standard'}`}>
                      <div className="record-details">
                        <h4>
                          {record.moduleCode}
                          {record.isRecorrection && <span className="badge warning">Re-correction</span>}
                        </h4>
                        <code className="record-hash">Hash: {record.provenanceHash.substring(0, 24)}...</code>
                        <div className="record-meta">
                          Sealed: {new Date(record.sealedAt).toLocaleString()} | Uploader: {record.uploader}
                        </div>
                      </div>
                      <div className="record-grade">{finalGrade}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}