import React, { useState } from 'react';
import { motion } from 'framer-motion';
import SilentBridgeApp from './SilentBridgeApp';
import './App.css';

export default function App() {
  const [activeView, setActiveView] = useState('master-hub');

  if (activeView === 'component-3') {
    return <SilentBridgeApp onReturnToMasterHub={() => setActiveView('master-hub')} />;
  }

  const components = [
    {
      id: 'comp3',
      number: 'COMPONENT 3',
      title: 'Silent Bridge Ingestion Portal',
      description: 'Schema-agnostic Excel/CSV parsing, time-gate policy enforcement, duplicate prevention, and private ledger SHA-256 block chaining.',
      badge: 'Active Hub',
      borderColor: '#10b981',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      badgeColor: '#34d399',
      techs: ['Node.js', 'Express', 'SheetJS', 'React'],
      actionType: 'internal',
      target: 'component-3',
      statusText: 'Online :5173'
    },
    {
      id: 'comp2',
      number: 'COMPONENT 2',
      title: 'BOE Review & Moderation Layer',
      description: 'Board of Examiners moderation portal, version history tracking, audit trails, and automated timeout finalization rules.',
      badge: 'Moderation Portal',
      borderColor: '#f59e0b',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeColor: '#fcd34d',
      techs: ['MongoDB', 'Mongoose', 'Cron Jobs', 'React'],
      actionType: 'external',
      link: 'https://component-2-boe-backend.onrender.com',
      statusText: 'Render Cloud'
    },
    {
      id: 'comp1',
      number: 'COMPONENT 1',
      title: 'Blockchain Proof & Storage Layer',
      description: 'Compiles final institutional academic datasets into Merkle trees, pins records securely to IPFS via Pinata, and anchors roots on Ethereum.',
      badge: 'Proof & Storage',
      borderColor: '#3b82f6',
      badgeBg: 'rgba(59, 130, 246, 0.15)',
      badgeColor: '#60a5fa',
      techs: ['Solidity', 'IPFS / Pinata', 'Merkle Trees', 'Web3'],
      actionType: 'external',
      link: 'https://github.com/nithikas-projects/silent-bridge-comp1',
      statusText: 'GitHub Repo'
    },
    {
      id: 'comp4',
      number: 'COMPONENT 4',
      title: 'Verification & ZKP Gateway',
      description: 'Empowers students and corporate employers to verify authentic academic results instantly using zero-knowledge proofs and immutable Merkle root proofs.',
      badge: 'Verifier Hub',
      borderColor: '#a855f7',
      badgeBg: 'rgba(168, 85, 247, 0.15)',
      badgeColor: '#c084fc',
      techs: ['Zero-Knowledge', 'React', 'Axios', 'Tailwind'],
      actionType: 'internal',
      target: 'component-3',
      statusText: 'Integrated'
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#060911',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '3rem 1.5rem',
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      overflowX: 'hidden'
    }}>
      
      {/* Background Glows */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none' }}></div>
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '400px', height: '400px', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none' }}></div>

      <div style={{ maxWidth: '1100px', width: '100%', zIndex: 1 }}>
        
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '3.5rem' }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            padding: '0.35rem 0.85rem',
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#60a5fa',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '20px',
            marginBottom: '1rem'
          }}>
            <span style={{ width: '7px', height: '7px', backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }}></span>
            System Operational • Decentralized Architecture Active
          </div>

          <h1 style={{
            fontSize: '2.75rem',
            fontWeight: '800',
            letterSpacing: '-0.03em',
            marginBottom: '0.75rem',
            background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Decentralized Academic Grading Platform
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', maxWidth: '700px', margin: '0 auto', lineHeight: '1.5' }}>
            SLIIT Software Engineering Research Project (R26-SE-011) — End-to-End Immutable Academic Verification Ecosystem.
          </p>
        </motion.header>

        {/* Section Heading */}
        <div style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '1.5rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></span>
          Interactive System Components & Portals
        </div>

        {/* 4-Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.5rem', marginBottom: '3.5rem' }}>
          {components.map((comp, idx) => (
            <motion.div
              key={comp.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              style={{
                background: 'rgba(17, 24, 39, 0.75)',
                backdropFilter: 'blur(16px)',
                border: `1px solid ${comp.borderColor}40`,
                borderRadius: '20px',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.3s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', padding: '0.3rem 0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {comp.number}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.3rem 0.75rem', borderRadius: '20px', background: comp.badgeBg, color: comp.badgeColor, border: `1px solid ${comp.borderColor}30`, fontWeight: '600' }}>
                    {comp.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.35rem', fontWeight: '700', marginBottom: '0.75rem', color: '#fff' }}>
                  {comp.title}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.925rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                  {comp.description}
                </p>

                {/* Tech Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.75rem' }}>
                  {comp.techs.map((tech, tIdx) => (
                    <span key={tIdx} style={{ fontSize: '0.75rem', fontFamily: 'monospace', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', color: '#64748b', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button & Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {comp.actionType === 'internal' ? (
                  <button
                    onClick={() => setActiveView(comp.target)}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      background: '#f8fafc',
                      color: '#060911',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      border: 'none',
                      transition: 'background 0.2s'
                    }}
                  >
                    Launch Portal →
                  </button>
                ) : (
                  <a
                    href={comp.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      background: '#f8fafc',
                      color: '#060911',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      transition: 'background 0.2s'
                    }}
                  >
                    Access Service ↗
                  </a>
                )}
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {comp.statusText}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Research Highlights Box */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          style={{
            background: '#0d1322',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '2.5rem',
            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5)'
          }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f8fafc' }}>
            <span style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>💡</span>
            Architectural Breakthroughs & Research Highlights
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '16px' }}>
              <h4 style={{ color: '#38bdf8', fontSize: '1.05rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⏱️</span> Autonomous Time-Gating
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: '1.6' }}>
                Programmatically enforces phase transitions (Standard Entry ➔ BOE Review ➔ Appeals ➔ Finalization) with zero human intervention.
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '16px' }}>
              <h4 style={{ color: '#38bdf8', fontSize: '1.05rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔐</span> Cryptographic Provenance
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: '1.6' }}>
                Replaces vulnerable PDF transcripts with decentralized hash anchors and Merkle proofs, making forged transcripts mathematically impossible.
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '16px' }}>
              <h4 style={{ color: '#38bdf8', fontSize: '1.05rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🛡️</span> Idempotency & PDPA
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: '1.6' }}>
                Prevents redundant ledger bloat via strict hash duplicate rejection while stripping private student identifiers to comply with strict privacy regulations.
              </p>
            </div>
          </div>
        </motion.div>

        <footer style={{
          marginTop: '3.5rem',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.85rem',
          fontFamily: 'monospace',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '2rem',
          width: '100%'
        }}>
          SLIIT • Department of Software Engineering • Research Project R26-SE-011 • Fully Deployed on Vercel & Railway
        </footer>

      </div>
    </div>
  );
}