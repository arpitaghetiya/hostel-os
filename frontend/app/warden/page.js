'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, API_BASE } from '../../lib/api';
import { io } from 'socket.io-client';
import QRCode from 'react-qr-code';

const navItems = [
  { id: 'dashboard', label: 'Live Dashboard', icon: '📊' },
  { id: 'attendance', label: 'Attendance', icon: '📋' },
  { id: 'gatepasses', label: 'Gate Passes', icon: '🎫' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
];

function WardenLiveDashboard({ user }) {
  const [stats, setStats] = useState({
    present: 0, late: 0, absent: 0, out_on_pass: 0, unmarked: 0
  });
  const [logs, setLogs] = useState([]);
  const [qrToken, setQrToken] = useState(null);
  const [activePasses, setActivePasses] = useState(0);
  const [overdueAlerts, setOverdueAlerts] = useState([]);
  
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Clock tick
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [attRes, gpRes] = await Promise.all([
          apiFetch('/attendance/today'),
          apiFetch('/gatepass/warden')
        ]);
        
        setStats(attRes.stats.counts);
        setLogs(attRes.stats.logs || []);
        setQrToken(attRes.qrToken);
        
        if (Array.isArray(gpRes)) {
          setActivePasses(gpRes.filter(p => p.status === 'active').length);
          setOverdueAlerts(gpRes.filter(p => p.status === 'overdue' || p.status === 'unresolved'));
        }
      } catch (err) {
        console.error("Failed to fetch initial stats:", err);
      }
    };
    
    fetchInitialData();
    
    // Connect Socket.io
    const socketURL = API_BASE.replace('/api', '');
    const socket = io(socketURL, {
      withCredentials: true
    });
    
    socket.on('connect', () => {
      console.log('Connected to socket server');
      socket.emit('join-hostel', user.hostel_id);
    });
    
    socket.on('attendance_updated', (newStats) => {
      setStats(newStats.counts);
      setLogs(newStats.logs || []);
    });

    socket.on('gatepass_updated', async () => {
      try {
        const gpRes = await apiFetch('/gatepass/warden');
        if (Array.isArray(gpRes)) {
          setActivePasses(gpRes.filter(p => p.status === 'active').length);
          setOverdueAlerts(gpRes.filter(p => p.status === 'overdue' || p.status === 'unresolved'));
        }
      } catch (err) {}
    });
    
    return () => {
      socket.disconnect();
    };
  }, [user.hostel_id]);

  const istTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  const istDate = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Live Dashboard 📡</h1>
        <p className="page-subtitle">{istDate} • {istTime} IST • {user.hostel_id}</p>
      </div>

      {/* Status Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Present (inc. Late)</span>
            <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>✅</div>
          </div>
          <div className="stat-value" style={{ color: 'var(--status-present)' }}>{stats.present + stats.late !== '——' ? stats.present + stats.late : '—'}</div>
          <div className="stat-label">{stats.late} arrived late (>9:30 PM)</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Absent</span>
            <div className="stat-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>❌</div>
          </div>
          <div className="stat-value" style={{ color: 'var(--status-absent)' }}>{stats.absent}</div>
          <div className="stat-label">Marked absent</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Out on Pass</span>
            <div className="stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>🚶</div>
          </div>
          <div className="stat-value" style={{ color: 'var(--status-out-on-pass)' }}>{stats.out_on_pass}</div>
          <div className="stat-label">On approved gate pass</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Unmarked</span>
            <div className="stat-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>⏳</div>
          </div>
          <div className="stat-value" style={{ color: 'var(--status-late)' }}>{stats.unmarked}</div>
          <div className="stat-label">Pending scan today</div>
        </div>
      </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Active Passes</span>
            <div className="stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>🎟️</div>
          </div>
          <div className="stat-value">{activePasses}</div>
          <div className="stat-label">Students currently outside</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Overdue Alerts</span>
            <div className="stat-icon" style={{ background: overdueAlerts.length > 0 ? 'var(--danger-bg)' : 'var(--bg-secondary)', color: overdueAlerts.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>🚨</div>
          </div>
          <div className="stat-value" style={{ color: overdueAlerts.length > 0 ? 'var(--danger)' : 'inherit' }}>{overdueAlerts.length}</div>
          <div className="stat-label">Requires immediate attention</div>
        </div>
      </div>

      {/* Overdue Alerts Banner */}
      {overdueAlerts.length > 0 && (
        <div style={{ marginTop: '1.5rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="blink">⚠️</span> Overdue Students
          </h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {overdueAlerts.map(alert => (
              <div key={alert.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,0,0,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>{alert.student_name} (Room {alert.room_no})</span>
                <span style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{alert.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', marginTop: '1.5rem', alignItems: 'start' }}>
          
        {/* Activity Feed */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Live Activity Feed</h3>
          {logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">No activity yet today.</div>
            </div>
          ) : (
            <div className="feed" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {logs.map((log) => {
                 let icon = '📌';
                 if(log.action === 'MARKED_ATTENDANCE') icon = '📸';
                 return (
                   <div key={log.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                     <div style={{ padding: '4px', background: 'var(--bg-input)', borderRadius: '4px', height: 'fit-content' }}>{icon}</div>
                     <div>
                       <div style={{ fontSize: '0.875rem' }}>
                         <span style={{ fontWeight: 600 }}>{log.actor_name}</span> {log.action.toLowerCase().replace('_', ' ')}
                       </div>
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                         {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                       </div>
                     </div>
                   </div>
                 );
              })}
            </div>
          )}
        </div>

        {/* Daily QR Code Generator View */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem' }}>Today&apos;s Scanner QR</h3>
          {qrToken ? (
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px' }}>
              <QRCode value={qrToken} size={200} />
            </div>
          ) : (
            <span className="spinner"></span>
          )}
          <p style={{ marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
             Students scan this code to mark their attendance. Token is valid until midnight.
          </p>
          <div style={{ fontSize: '0.7rem', color: 'var(--border-color)', marginTop: '0.5rem', userSelect: 'all' }}>
            {qrToken}
          </div>
        </div>
        
      </div>
    </>
  );
}

function AttendanceManagement() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Attendance Management</h1>
        <p className="page-subtitle">View and manage student attendance records</p>
      </div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">Past Records & Summaries coming soon</div>
        </div>
      </div>
    </>
  );
}

function GatePassManagement() {
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  
  const { user } = useAuth();

  const fetchPasses = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/gatepass/warden');
      setPasses(data);
    } catch (err) {
      setError('Failed to fetch gate passes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasses();
    
    // Listen for realtime updates
    const socketURL = API_BASE.replace('/api', '');
    const socket = io(socketURL, { withCredentials: true });
    socket.on('connect', () => socket.emit('join-hostel', user.hostel_id));
    socket.on('gatepass_updated', () => fetchPasses());
    
    return () => socket.disconnect();
  }, [user.hostel_id]);

  const handleAction = async (passId, status) => {
    try {
      setActionLoading(passId);
      let note = '';
      if (status === 'rejected') {
        note = prompt('Reason for rejection (optional):') || '';
      }
      
      await apiFetch('/gatepass/approve', {
        method: 'POST',
        body: JSON.stringify({ passId, status, note })
      });
      
      // The socket will trigger a refetch, but we also manually refetch for safety
      fetchPasses();
    } catch (err) {
      alert(err.message || 'Failed to update pass.');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingPasses = passes.filter(p => p.status === 'pending');
  const otherPasses = passes.filter(p => p.status !== 'pending');

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved': return <span className="badge badge-success">Approved</span>;
      case 'active': return <span className="badge badge-success">Active (Out)</span>;
      case 'pending': return <span className="badge badge-warning">Pending</span>;
      case 'overdue': return <span className="badge badge-danger blink">Overdue!</span>;
      case 'unresolved': return <span className="badge badge-danger">Unresolved</span>;
      case 'rejected': return <span className="badge badge-danger">Rejected</span>;
      default: return <span className="badge badge-info">{status}</span>;
    }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Gate Pass Requests</h1>
        <p className="page-subtitle">Approve or reject student gate pass requests</p>
      </div>

      {error && <div className="alert alert-error" style={{marginBottom: '1rem'}}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* Pending Requests */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Pending Requests ({pendingPasses.length})</h3>
          
          {loading && passes.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner"></span></div>
          ) : pendingPasses.length === 0 ? (
             <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">No pending requests</div>
             </div>
          ) : (
             <div className="table-container">
               <table className="table">
                 <thead>
                   <tr>
                     <th>Student</th>
                     <th>Reason</th>
                     <th>Expected Out</th>
                     <th>Expected Return</th>
                     <th>Actions</th>
                   </tr>
                 </thead>
                 <tbody>
                   {pendingPasses.map(pass => (
                     <tr key={pass.id}>
                       <td>
                         <div style={{ fontWeight: 600 }}>{pass.student_name}</div>
                         <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Room {pass.room_no}</div>
                       </td>
                       <td>{pass.reason}</td>
                       <td>{new Date(pass.expected_out).toLocaleString()}</td>
                       <td>{new Date(pass.expected_return).toLocaleString()}</td>
                       <td>
                         <div style={{ display: 'flex', gap: '0.5rem' }}>
                           <button 
                             className="btn btn-sm btn-success" 
                             disabled={actionLoading === pass.id}
                             onClick={() => handleAction(pass.id, 'approved')}
                           >
                             Approve
                           </button>
                           <button 
                             className="btn btn-sm btn-danger" 
                             disabled={actionLoading === pass.id}
                             onClick={() => handleAction(pass.id, 'rejected')}
                           >
                             Reject
                           </button>
                         </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          )}
        </div>

        {/* Other / History */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Active & Past Passes</h3>
          {loading && passes.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '2rem' }}><span className="spinner"></span></div>
          ) : otherPasses.length === 0 ? (
             <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div className="empty-state-text">No historical passes found</div>
             </div>
          ) : (
             <div className="table-container">
               <table className="table">
                 <thead>
                   <tr>
                     <th>Student</th>
                     <th>Status</th>
                     <th>Reason</th>
                     <th>Out Time</th>
                     <th>Return Time</th>
                   </tr>
                 </thead>
                 <tbody>
                   {otherPasses.map(pass => (
                     <tr key={pass.id}>
                       <td>
                         <div style={{ fontWeight: 600 }}>{pass.student_name}</div>
                         <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Room {pass.room_no}</div>
                       </td>
                       <td>{getStatusBadge(pass.status)}</td>
                       <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                         {pass.reason}
                       </td>
                       <td>
                         <div style={{ fontSize: '0.8125rem' }}>{new Date(pass.expected_out).toLocaleString()}</div>
                         {pass.exit_scanned_at && <div style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Actual: {new Date(pass.exit_scanned_at).toLocaleTimeString()}</div>}
                       </td>
                       <td>
                         <div style={{ fontSize: '0.8125rem' }}>{new Date(pass.expected_return).toLocaleString()}</div>
                         {pass.return_scanned_at && <div style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Actual: {new Date(pass.return_scanned_at).toLocaleTimeString()}</div>}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          )}
        </div>

      </div>
    </>
  );
}

function NotificationsPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Notifications</h1>
        <p className="page-subtitle">Alerts and updates</p>
      </div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div className="empty-state-text">No notifications yet</div>
        </div>
      </div>
    </>
  );
}

export default function WardenDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { user } = useAuth();

  // The MVP requirements requested keeping it simple. We can omit the empty attendance management tab.
  return (
    <DashboardLayout role="warden" navItems={navItems.filter(n => n.id !== 'attendance')} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'dashboard' && user && <WardenLiveDashboard user={user} />}
      {activeTab === 'gatepasses' && <GatePassManagement />}
      {activeTab === 'notifications' && <NotificationsPage />}
    </DashboardLayout>
  );
}
