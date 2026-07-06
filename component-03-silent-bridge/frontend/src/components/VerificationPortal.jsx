import React, { useState } from 'react';
import axios from 'axios';
import './VerificationPortal.css';
// Ensure this path is correct based on your project structure
import moduleConfig from '../../../middleware/module-config.json';

const GRADE_POINTS = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'E': 0.0
};

export default function VerificationPortal() {
  const [mode, setMode] = useState('transcript'); // 'transcript' or 'single'
  const [studentId, setStudentId] = useState('');
  const [verifyModule, setVerifyModule] = useState('');
  const [verifyGrade, setVerifyGrade] = useState('');
  const [status, setStatus] = useState('idle');
  const [records, setRecords] = useState([]);
  const [cgpa, setCgpa] = useState(0);
  const [validationResult, setValidationResult] = useState(null);

  const handleVerification = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setValidationResult(null);
    setRecords([]);

    try {
      const response = await axios.get(`http://localhost:5000/api/verify/${studentId}`);
      const fetchedRecords = response.data.records;

      if (mode === 'transcript') {
        setRecords(fetchedRecords);
        calculateOffChainGPA(fetchedRecords);
        setStatus('success');
      } else {
        const record = fetchedRecords.find(r => r.moduleCode === verifyModule.toUpperCase());
        const actualGrade = record ? (record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade']) : null;

        setValidationResult(actualGrade && actualGrade.toUpperCase() === verifyGrade.toUpperCase() ? 'valid' : 'invalid');
        setStatus('success');
      }
    } catch (error) {
      setStatus('error');
    }
  };

  const calculateOffChainGPA = (verifiedRecords) => {
    let totalQualityPoints = 0;
    let totalCredits = 0;

    verifiedRecords.forEach(record => {
      const grade = record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade'];
      const credits = moduleConfig[record.moduleCode] || 0;

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
          <div className="mode-toggle">
            <button className={mode === 'transcript' ? 'active' : ''} onClick={() => setMode('transcript')}>Full Transcript</button>
            <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>Validate Single Grade</button>
          </div>
        </div>

        <form className="vp-search" onSubmit={handleVerification}>
          <input type="text" placeholder="Candidate ID" value={studentId} onChange={(e) => setStudentId(e.target.value.toUpperCase())} required />
          {mode === 'single' && (
            <>
              <input type="text" placeholder="Module Code" value={verifyModule} onChange={(e) => setVerifyModule(e.target.value.toUpperCase())} required />
              <input type="text" placeholder="Grade" value={verifyGrade} onChange={(e) => setVerifyGrade(e.target.value.toUpperCase())} required />
            </>
          )}
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? <div className="spinner"></div> : 'Verify Proof'}
          </button>
        </form>

        {status === 'error' && <div className="vp-alert error">❌ Invalid Candidate ID or no records found.</div>}

        {status === 'success' && mode === 'single' && (
          <div className={`vp-alert ${validationResult === 'valid' ? 'success' : 'error'}`}>
            {validationResult === 'valid' ? '✅ GRADE IS AUTHENTIC' : '❌ GRADE IS INVALID / TAMPERED'}
          </div>
        )}

        {status === 'success' && mode === 'transcript' && (
          <div className="vp-dashboard">
            <div className="gpa-widget">
              <h2>Verified Cumulative GPA</h2>
              <div className="gpa-score">{cgpa}</div>
            </div>
            <div className="ledger-history">
              <table className="transcript-table">
                <thead>
                  <tr><th>Module</th><th>Credits</th><th>Grade</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {records.map((record, i) => (
                    <tr key={i}>
                      <td>{record.moduleCode}</td>
                      <td>{moduleConfig[record.moduleCode] || 'N/A'}</td>
                      <td className="grade-cell">{record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade']}</td>
                      <td>{record.isRecorrection ? <span className="badge warning">Appealed</span> : <span className="badge success">Final</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}