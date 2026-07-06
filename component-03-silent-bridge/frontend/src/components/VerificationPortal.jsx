import React, { useState } from 'react';
import axios from 'axios';

// Standard Sri Lankan / SLIIT Grading Scale
const GRADE_POINTS = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'E': 0.0
};

export default function VerificationPortal() {
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [records, setRecords] = useState([]);
  const [cgpa, setCgpa] = useState(0);

  const handleVerification = async () => {
    if (!studentId.trim()) return;
    setStatus('loading');
    setRecords([]);
    setCgpa(0);

    try {
      // Hit your Component 3 Verification API
      const response = await axios.get(`http://localhost:5000/api/verify/${studentId}`);
      const fetchedRecords = response.data.records;

      setRecords(fetchedRecords);
      calculateOffChainGPA(fetchedRecords);
      setStatus('success');
    } catch (error) {
      console.error('Verification failed:', error);
      setStatus('error');
    }
  };

  // 🧮 THE OFF-CHAIN GPA ENGINE
  const calculateOffChainGPA = (verifiedRecords) => {
    let totalQualityPoints = 0;
    let totalCredits = 0;

    verifiedRecords.forEach(record => {
      // Safely extract grades and credits, accounting for different Excel column names
      const grade = record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade'];
      const credits = parseFloat(record.gradingData['Credits'] || 0);

      if (grade && GRADE_POINTS[grade.toUpperCase()] !== undefined && credits > 0) {
        const pointValue = GRADE_POINTS[grade.toUpperCase()];
        totalQualityPoints += (pointValue * credits);
        totalCredits += credits;
      }
    });

    const calculated = totalCredits > 0 ? (totalQualityPoints / totalCredits).toFixed(2) : 0.00;
    setCgpa(calculated);
  };

  return (
    <div style={{ backgroundColor: '#121212', color: '#ffffff', minHeight: '100vh', padding: '3rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ color: '#4ade80', fontSize: '2.5rem', marginBottom: '0.5rem' }}>Corporate Verification Portal</h1>
          <p style={{ color: '#888', fontSize: '1.1rem' }}>Trustless Off-Chain GPA Engine & Audit Trail</p>
        </div>

        {/* Search Bar */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', backgroundColor: '#1e1e1e', padding: '1.5rem', borderRadius: '12px' }}>
          <input
            type="text"
            placeholder="Enter Candidate ID (e.g., IT22061348)"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
            style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: '1px solid #333', backgroundColor: '#2d2d2d', color: '#fff', fontSize: '1.1rem' }}
          />
          <button
            onClick={handleVerification}
            disabled={status === 'loading'}
            style={{ padding: '1rem 2rem', borderRadius: '8px', border: 'none', backgroundColor: '#4ade80', color: '#000', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}
          >
            {status === 'loading' ? 'Querying Ledger...' : 'Verify Cryptographic Proof'}
          </button>
        </div>

        {/* Error State */}
        {status === 'error' && (
          <div style={{ backgroundColor: '#ef444420', border: '1px solid #ef4444', padding: '1.5rem', borderRadius: '8px', color: '#ef4444', textAlign: 'center' }}>
            ❌ Invalid Candidate ID or no cryptographic records found in the ledger.
          </div>
        )}

        {/* Success Dashboard */}
        {status === 'success' && (
          <div style={{ animation: 'fadeIn 0.5s ease-in' }}>

            {/* Huge Off-Chain GPA Card */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '2rem', textAlign: 'center', marginBottom: '2rem', boxShadow: '0 4px 20px rgba(74, 222, 128, 0.1)' }}>
              <h2 style={{ color: '#888', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.9rem', marginBottom: '1rem' }}>Verified Cumulative GPA</h2>
              <div style={{ fontSize: '5rem', fontWeight: '900', color: '#4ade80', lineHeight: '1' }}>
                {cgpa}
              </div>
              <p style={{ color: '#aaa', marginTop: '1rem', fontSize: '0.9rem' }}>
                Calculated dynamically off-chain using immutable ledger data.
              </p>
            </div>

            {/* Verified Module Breakdown */}
            <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '1.5rem', color: '#ccc' }}>Cryptographic Ledger History</h3>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {records.map((record, index) => {
                // Extract grade for display
                const finalGrade = record.gradingData['Final Grade'] || record.gradingData['Overall Grade'] || record.gradingData['Appealed Grade'] || 'N/A';

                return (
                  <div key={index} style={{ backgroundColor: '#1e1e1e', borderLeft: record.isRecorrection ? '4px solid #f59e0b' : '4px solid #4ade80', padding: '1.5rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#fff' }}>
                        {record.moduleCode}
                        {record.isRecorrection && <span style={{ marginLeft: '10px', fontSize: '0.8rem', backgroundColor: '#f59e0b20', color: '#f59e0b', padding: '2px 8px', borderRadius: '12px' }}>Re-correction</span>}
                      </h4>
                      <div style={{ fontFamily: 'monospace', color: '#666', fontSize: '0.85rem' }}>
                        Block Hash: {record.provenanceHash.substring(0, 24)}...
                      </div>
                      <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '4px' }}>
                        Sealed: {new Date(record.sealedAt).toLocaleString()} | Uploader: {record.uploader}
                      </div>
                    </div>

                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff', backgroundColor: '#2d2d2d', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                      {finalGrade}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}