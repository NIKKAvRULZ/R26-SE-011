// frontend/src/components/LecturerPortal.jsx
import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './LecturerPortal.css';

const LecturerPortal = ({ user }) => {
    const [isRecorrection, setIsRecorrection] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('');
    const [receipt, setReceipt] = useState(null);
    const [moduleCode, setModuleCode] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    
    const [activePolicy, setActivePolicy] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [dbTimestamp, setDbTimestamp] = useState(null);

    // 🚨 FIXED: Fetch System Policy with cache-buster to reflect Admin changes instantly
    useEffect(() => {
        const fetchPolicyAndStatus = async () => {
            try {
                const policyRes = await axios.get(`http://localhost:5000/api/policy?t=${Date.now()}`);
                setActivePolicy(policyRes.data);

                if (moduleCode.trim().length > 2) {
                    const statusRes = await axios.get(`http://localhost:5000/api/module-status/${moduleCode.trim()}`);
                    setDbTimestamp(statusRes.data.isNew ? null : statusRes.data.firstUploadTime);
                } else {
                    setDbTimestamp(null);
                }
            } catch (err) {
                console.error("Error fetching policy or status:", err);
            }
        };

        fetchPolicyAndStatus();
    }, [moduleCode]);

    // Ticking Live Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles && acceptedFiles.length > 0) {
            setSelectedFile(acceptedFiles[0]);
            setUploadStatus('idle');
            setReceipt(null);
            setErrorMessage('');
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv']
        },
        maxFiles: 1
    });

    const handleUpload = async () => {
        if (!selectedFile) return;
        setUploadStatus('uploading');
        setErrorMessage('');

        const formData = new FormData();
        formData.append('gradingSheet', selectedFile);
        formData.append('moduleCode', moduleCode);
        formData.append('uploader', user.name);
        formData.append('isRecorrection', isRecorrection);

        try {
            const response = await axios.post('http://localhost:5000/api/ingest', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadStatus('success');
            setReceipt(response.data);
            setModuleCode('');
            setIsRecorrection(false); 
        } catch (error) {
            console.error('Upload failed:', error);
            if (error.response && (error.response.status === 403 || error.response.status === 400)) {
                setUploadStatus('server-blocked');
                setErrorMessage(error.response.data.error);
            } else {
                setUploadStatus('network-error');
            }
        }
    };

    // Smart Status Renderer
    const renderModuleStatus = () => {
        if (!activePolicy) return null;

        if (moduleCode.trim().length < 3) {
            return (
                <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>🔍</span>
                    Awaiting module selection. Type a Module Code below to view its live access status.
                </div>
            );
        }

        if (!dbTimestamp) {
            return (
                <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', borderRadius: '12px', borderLeft: '4px solid #a855f7', textAlign: 'left' }}>
                    <h3 style={{ color: '#a855f7', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>✨</span> Unregistered Module
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        <strong>{moduleCode.toUpperCase()}</strong> has no previous uploads in the ledger. 
                        Uploading now will initialize Day 1 of the Standard Entry phase.
                    </p>
                </div>
            );
        }

        // Calculate Phases for Existing Module
        const startDate = new Date(dbTimestamp);
        
        const addTime = (baseDate, amount, unit) => {
            const d = new Date(baseDate);
            if (unit === 'minutes') d.setMinutes(d.getMinutes() + parseInt(amount));
            else d.setDate(d.getDate() + parseInt(amount));
            return d;
        };

        const phase1End = addTime(startDate, activePolicy.standardUploadWindow, activePolicy.timeUnit);
        const phase2End = addTime(startDate, activePolicy.boeReviewWindow, activePolicy.timeUnit);
        const phase3End = addTime(startDate, activePolicy.specialConcernsWindow, activePolicy.timeUnit);

        const formatTime = (date) => date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let currentPhase, statusColor, nextActionText, nextActionTime, statusIcon;

        if (currentTime < phase1End) {
            currentPhase = "Standard Entry (Open)";
            statusColor = "var(--accent-main)"; // Green
            statusIcon = "✅";
            nextActionText = "Locks for BOE Review at:";
            nextActionTime = phase1End;
        } else if (currentTime >= phase1End && currentTime < phase2End) {
            currentPhase = "BOE Review (Locked)";
            statusColor = "var(--warning)"; // Yellow
            statusIcon = "🔒";
            nextActionText = "Unlocks for Special Concerns at:";
            nextActionTime = phase2End;
        } else if (currentTime >= phase2End && currentTime < phase3End) {
            currentPhase = "Special Concerns (Appeals Open)";
            statusColor = "#3b82f6"; // Blue
            statusIcon = "📝";
            nextActionText = "Permanently Locks at:";
            nextActionTime = phase3End;
        } else {
            currentPhase = "Permanently Locked (Finalized)";
            statusColor = "var(--error)"; // Red
            statusIcon = "🛑";
            nextActionText = "Module Finalized on:";
            nextActionTime = phase3End;
        }

        return (
            <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', borderRadius: '12px', borderLeft: `4px solid ${statusColor}`, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Status: {moduleCode.toUpperCase()}</span>
                    <h3 style={{ color: statusColor, margin: '0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{statusIcon}</span> {currentPhase}
                    </h3>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'right' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block' }}>{nextActionText}</span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{formatTime(nextActionTime)}</strong>
                </div>
            </div>
        );
    };

    return (
        <div className="portal-wrapper">
            <div className="portal-container">
                <div className="portal-header">
                    <h2>Secure Data Ingestion</h2>
                    <p>
                        Scale-ready academic records management. Upload your grading sheets to mathematically
                        seal records via the Silent Bridge decentralized middleware.
                    </p>
                </div>

                {/* Dynamic Single-Module Status Banner */}
                <div className="policy-banner" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                            <span>📡</span> Live Module Scanner
                        </h4>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
                            {currentTime.toLocaleTimeString()}
                        </span>
                    </div>
                    
                    {renderModuleStatus()}
                </div>

                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'drag-active' : ''}`}>
                    <input {...getInputProps()} />
                    <div className="dropzone-content">
                        <span className="upload-icon">💠</span>
                        {isDragActive ? (
                            <p>Release to secure the file...</p>
                        ) : (
                            <>
                                <p>Select or drag grading sheet</p>
                                <span>Supports .xlsx and .csv files</span>
                            </>
                        )}
                    </div>
                </div>

                {selectedFile && (
                    <div className="file-details">
                        <div className="file-info-header">
                            <span className="file-icon" style={{ fontSize: '1.5rem' }}>📄</span>
                            <span className="file-name" style={{ fontSize: '1.1rem' }}>{selectedFile.name}</span>
                        </div>

                        <div className="upload-actions" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                                <input
                                    type="text"
                                    placeholder="Enter Module Code (e.g. SE301)"
                                    value={moduleCode}
                                    onChange={(e) => setModuleCode(e.target.value.toUpperCase())}
                                    required
                                    className="module-input"
                                    style={{ flex: 1 }}
                                />
                                <button
                                    className="upload-btn"
                                    onClick={handleUpload}
                                    disabled={uploadStatus === 'uploading' || !moduleCode.trim()}
                                >
                                    {uploadStatus === 'uploading' ? 'Sealing...' : 'Verify & Ledger Upload'}
                                </button>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#aaa', fontSize: '0.9rem' }}>
                                <input
                                    type="checkbox"
                                    checked={isRecorrection}
                                    onChange={(e) => setIsRecorrection(e.target.checked)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                Flag this upload as a formal Re-correction / Grade Appeal
                            </label>
                        </div>
                    </div>
                )}

                {uploadStatus === 'network-error' && (
                    <div className="alert error">
                        ⚠️ Connection failure. Decentralized middleware at port 5000 is unreachable.
                    </div>
                )}

                {uploadStatus === 'server-blocked' && (
                    <div className="alert error" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <strong style={{ fontSize: '1.1rem' }}>🛑 Upload Blocked by System Policy</strong>
                        <span>{errorMessage}</span>
                    </div>
                )}

                {uploadStatus === 'success' && receipt && receipt.status === 'duplicate' && (
                    <div className="alert warning" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)', color: '#fcd34d', marginTop: '2rem' }}>
                        <div>
                            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>⚠️ Duplicate Payload Rejected</strong>
                            This exact cryptographic hash has already been anchored to the ledger for <strong>{receipt.moduleCode}</strong>.
                        </div>
                    </div>
                )}
                
                {uploadStatus === 'success' && receipt && receipt.status === 'new' && (
                    <div className="receipt-card">
                        <h3>✅ Cryptographically Secured</h3>
                        <p><strong>{receipt.recordCount} entries</strong> have been parsed, validated, and permanently sealed.</p>
                        <div className="hash-box">
                            <small>SHA-256 Provenance Hash</small>
                            <code>{receipt.provenanceHash}</code>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LecturerPortal;