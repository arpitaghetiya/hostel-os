'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function SecurityDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [scanPreview, setScanPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [scannerInstance, setScannerInstance] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'security') {
      router.replace(`/${user.role}`);
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== 'security') return;

    const timer = setTimeout(() => {
      const scanner = new Html5QrcodeScanner('qr-reader', { 
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      }, false);
      
      setScannerInstance(scanner);

      scanner.render((decodedText) => {
        scanner.pause(true); // Stop scanning momentarily
        handleScanLookup(decodedText, scanner);
      }, () => {
        // Silently ignore standard camera decoding errors
      });
      
      return () => {
        scanner.clear().catch(e => console.error("Failed to clear scanner", e));
      };
    }, 100);
    
    return () => clearTimeout(timer);
  }, [user]);

  const handleScanLookup = async (qrToken, scanner) => {
    try {
      setError('');
      setSuccess('');
      setScanPreview(null);
      
      // Fetch scan preview info
      const info = await apiFetch(`/gatepass/verify/${qrToken}`);
      // Store token along with info to submit later
      setScanPreview({ ...info, qrToken });
      
    } catch (err) {
      setError(`❌ ${err.message || 'Invalid QR code.'}`);
      setTimeout(() => {
        setError('');
        scanner.resume();
      }, 3000);
    }
  };

  const confirmAction = async () => {
    if (!scanPreview) return;
    try {
      setActionLoading(true);
      setError('');
      
      await apiFetch('/gatepass/scan', {
        method: 'POST',
        body: JSON.stringify({ qrToken: scanPreview.qrToken, action: scanPreview.nextAction })
      });
      
      setSuccess(`✅ ${scanPreview.nextAction.toUpperCase()} logged for ${scanPreview.student}.`);
      setScanPreview(null);
      
      setTimeout(() => {
        setSuccess('');
        if (scannerInstance) scannerInstance.resume();
      }, 3000);
      
    } catch (err) {
      setError(`❌ ${err.message || 'Action failed.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const cancelAction = () => {
    setScanPreview(null);
    setError('');
    if (scannerInstance) scannerInstance.resume();
  };

  if (loading || !user || user.role !== 'security') {
    return (
      <div className="loading-screen" style={{ background: 'var(--bg-primary)' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  return (
    <div className="scan-wrapper" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Security Gate</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {user.hostel_id} Gate • Single Scan
            </div>
          </div>
        </div>
        <button
          onClick={async () => {
             if (scannerInstance) await scannerInstance.clear();
             await logout();
             router.replace('/login');
          }}
          className="btn btn-sm"
          style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0.5rem' }}
        >
          Sign Out
        </button>
      </div>

      {/* Main Area */}
      <div style={{ marginTop: '5rem', width: '100%', maxWidth: '400px', padding: '0 1rem' }}>
        
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}
        
        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            {success}
          </div>
        )}

        {/* Scan Results Confirmation Dialog */}
        {scanPreview ? (
          <div className="card" style={{ textAlign: 'center', animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>👤</div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{scanPreview.student}</h2>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Room {scanPreview.room} • {scanPreview.status.toUpperCase()}
              </div>
            </div>

            <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                Required Action
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: scanPreview.nextAction === 'exit' ? 'var(--warning)' : 'var(--success)' }}>
                LOG {scanPreview.nextAction.toUpperCase()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1 }} 
                onClick={cancelAction}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                className={`btn ${scanPreview.nextAction === 'exit' ? 'btn-primary' : 'btn-success'}`}
                style={{ flex: 2 }} 
                onClick={confirmAction}
                disabled={actionLoading}
              >
                {actionLoading ? <span className="spinner"></span> : `Confirm ${scanPreview.nextAction.toUpperCase()}`}
              </button>
            </div>
          </div>
        ) : (
          /* Camera Viewport */
          <div className="card" style={{ padding: '0.5rem', display: success || error ? 'none' : 'block' }}>
            <div id="qr-reader" style={{ width: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}></div>
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          <p>Camera is always active. Point at student QR to scan.</p>
        </div>
        
      </div>
    </div>
  );
}
