'use client';

import { useEffect, useState } from 'react';

interface DashboardStats {
  users: { total: number; active: number };
  events: { total: number; synced: number };
  sync: { failed: number; recentTransactions: any[] };
  conflicts: { today: number };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/dashboard/stats', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const navItems = [
    { id: 'overview', icon: '📊', label: 'Overview' },
    { id: 'sync', icon: '🔄', label: 'Sync Monitor' },
    { id: 'users', icon: '👥', label: 'Users' },
    { id: 'conflicts', icon: '⚠️', label: 'Conflicts' },
    { id: 'audit', icon: '📋', label: 'Audit Logs' },
    { id: 'webhooks', icon: '🔗', label: 'Webhooks' },
    { id: 'security', icon: '🛡️', label: 'Security' },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🔄</div>
          <div>
            <div className="sidebar-logo-text">CalendarSync</div>
            <div className="sidebar-logo-sub">Enterprise Admin</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
          <button className="nav-item" onClick={() => window.location.href = '/'}>
            <span className="nav-item-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === 'overview' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">Dashboard Overview</h1>
              <p className="page-subtitle">Real-time synchronization monitoring</p>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid animate-stagger">
              <div className="stat-card">
                <span className="stat-icon">👥</span>
                <div className="stat-label">Active Users</div>
                <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>
                  {loading ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.users.active || 0}
                </div>
                <div className="stat-change positive">
                  ↑ {stats?.users.total || 0} total
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-icon">📅</span>
                <div className="stat-label">Events Synced</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>
                  {loading ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.events.synced || 0}
                </div>
                <div className="stat-change positive">
                  {stats?.events.total || 0} total events
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-icon">❌</span>
                <div className="stat-label">Failed Syncs</div>
                <div className="stat-value" style={{ color: stats?.sync.failed ? 'var(--error)' : 'var(--success)' }}>
                  {loading ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.sync.failed || 0}
                </div>
                <div className={`stat-change ${stats?.sync.failed ? 'negative' : 'positive'}`}>
                  {stats?.sync.failed ? '⚠ Needs attention' : '✓ All clear'}
                </div>
              </div>

              <div className="stat-card">
                <span className="stat-icon">⚡</span>
                <div className="stat-label">Conflicts Today</div>
                <div className="stat-value" style={{ color: 'var(--warning)' }}>
                  {loading ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.conflicts.today || 0}
                </div>
                <div className="stat-change positive">
                  Auto-resolved
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="table-container" style={{ animationDelay: '0.3s' }}>
              <div className="table-header">
                <h3 className="table-title">Recent Sync Transactions</h3>
                <button className="btn btn-ghost btn-sm" onClick={fetchStats}>🔄 Refresh</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Direction</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.sync.recentTransactions?.length ? (
                    stats.sync.recentTransactions.map((tx: any) => (
                      <tr key={tx.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {tx.transactionId?.substring(0, 12)}...
                        </td>
                        <td>
                          <span className="badge badge-info">
                            {tx.direction === 'GOOGLE_TO_OUTLOOK' ? '📧 → 📨' : '📨 → 📧'}
                            {' '}{tx.direction?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>{tx.action}</td>
                        <td>
                          <span className={`badge ${
                            tx.status === 'COMPLETED' ? 'badge-success' :
                            tx.status === 'FAILED' ? 'badge-error' :
                            tx.status === 'PROCESSING' ? 'badge-info' : 'badge-warning'
                          }`}>
                            <span className="badge-dot" />
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty-state">
                          <div className="empty-state-icon">📭</div>
                          <p>No sync transactions yet. Connect your calendars to get started.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">Sync Monitor</h1>
              <p className="page-subtitle">Real-time event synchronization status</p>
            </div>
            <SyncMonitorPanel />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">User Management</h1>
              <p className="page-subtitle">Manage synced users and their calendars</p>
            </div>
            <UsersPanel />
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">Conflict Analytics</h1>
              <p className="page-subtitle">Meeting conflicts and auto-rejections</p>
            </div>
            <ConflictsPanel />
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">Audit Logs</h1>
              <p className="page-subtitle">Immutable security and activity log</p>
            </div>
            <AuditPanel />
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">Webhook Management</h1>
              <p className="page-subtitle">Active subscriptions and health</p>
            </div>
            <WebhooksPanel />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="animate-in">
            <div className="page-header">
              <h1 className="page-title">Security Dashboard</h1>
              <p className="page-subtitle">Enterprise security posture overview</p>
            </div>
            <SecurityPanel />
          </div>
        )}
      </main>
    </div>
  );
}

// ---- Sub-panels ----

function SyncMonitorPanel() {
  const [transactions, setTransactions] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/admin/sync/transactions?limit=50', { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setTransactions(d.data.transactions));
  }, []);

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">All Sync Transactions</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm">Filter</button>
          <button className="btn btn-primary btn-sm">Export</button>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>ID</th><th>Direction</th><th>Action</th><th>Status</th><th>Retry</th><th>Time</th></tr>
        </thead>
        <tbody>
          {transactions.map((tx: any) => (
            <tr key={tx.id}>
              <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{tx.transactionId?.substring(0, 16)}</td>
              <td><span className="badge badge-info">{tx.direction?.replace(/_/g, ' ')}</span></td>
              <td>{tx.action}</td>
              <td><span className={`badge ${tx.status === 'COMPLETED' ? 'badge-success' : tx.status === 'FAILED' ? 'badge-error' : 'badge-warning'}`}>{tx.status}</span></td>
              <td>{tx.retryCount}/{tx.maxRetries || 5}</td>
              <td style={{ fontSize: '12px' }}>{new Date(tx.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setUsers(d.data.users));
  }, []);

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">All Users</h3>
      </div>
      <table>
        <thead>
          <tr><th>User</th><th>Role</th><th>Google</th><th>Microsoft</th><th>Calendars</th><th>Status</th><th>Last Sync</th></tr>
        </thead>
        <tbody>
          {users.map((u: any) => (
            <tr key={u.id}>
              <td>
                <div><strong style={{ color: 'var(--text-primary)' }}>{u.displayName}</strong></div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
              </td>
              <td><span className={`badge ${u.role === 'ADMIN' ? 'badge-error' : 'badge-info'}`}>{u.role}</span></td>
              <td>{u.googleConnected ? <span className="badge badge-success">✓ Connected</span> : <span className="badge badge-warning">Not connected</span>}</td>
              <td>{u.microsoftConnected ? <span className="badge badge-success">✓ Connected</span> : <span className="badge badge-warning">Not connected</span>}</td>
              <td>{u._count?.calendars || 0}</td>
              <td>{u.isActive ? <span className="badge badge-success"><span className="badge-dot" /> Active</span> : <span className="badge badge-error">Inactive</span>}</td>
              <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{u.lastSyncAt ? new Date(u.lastSyncAt).toLocaleString() : 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConflictsPanel() {
  const [conflicts, setConflicts] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/admin/conflicts', { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setConflicts(d.data.conflicts));
  }, []);

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">Conflict History</h3>
      </div>
      <table>
        <thead>
          <tr><th>User</th><th>Type</th><th>Resolution</th><th>Reason</th><th>Notified</th><th>Time</th></tr>
        </thead>
        <tbody>
          {conflicts.map((c: any) => (
            <tr key={c.id}>
              <td>{c.user?.email || 'Unknown'}</td>
              <td><span className="badge badge-warning">{c.conflictType?.replace(/_/g, ' ')}</span></td>
              <td><span className="badge badge-error">{c.resolution?.replace(/_/g, ' ')}</span></td>
              <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.rejectionReason}</td>
              <td>{c.notificationSent ? '✅' : '⏳'}</td>
              <td style={{ fontSize: '12px' }}>{new Date(c.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/admin/audit-logs?limit=100', { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setLogs(d.data.logs));
  }, []);

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">Immutable Audit Trail</h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔒 Records cannot be modified or deleted</span>
      </div>
      <table>
        <thead>
          <tr><th>Action</th><th>Resource</th><th>Source</th><th>IP</th><th>Time</th></tr>
        </thead>
        <tbody>
          {logs.map((log: any) => (
            <tr key={log.id}>
              <td><span className={`badge ${
                log.action?.includes('FAIL') || log.action?.includes('REJECTED') ? 'badge-error' :
                log.action?.includes('SUCCESS') || log.action?.includes('COMPLETED') ? 'badge-success' :
                log.action?.includes('LOOP') ? 'badge-warning' : 'badge-info'
              }`}>{log.action}</span></td>
              <td>{log.resourceType} / <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{log.resourceId?.substring(0, 12)}</span></td>
              <td>{log.source}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{log.ipAddress}</td>
              <td style={{ fontSize: '12px' }}>{new Date(log.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WebhooksPanel() {
  const [subs, setSubs] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/admin/webhooks', { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setSubs(d.data.subscriptions));
  }, []);

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">Webhook Subscriptions</h3>
      </div>
      <table>
        <thead>
          <tr><th>Calendar</th><th>Provider</th><th>Status</th><th>Expires</th><th>User</th></tr>
        </thead>
        <tbody>
          {subs.map((s: any) => (
            <tr key={s.id}>
              <td>{s.calendar?.name || 'Unknown'}</td>
              <td><span className={`badge ${s.provider === 'GOOGLE' ? 'badge-info' : 'badge-success'}`}>{s.provider}</span></td>
              <td><span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-error'}`}><span className="badge-dot" />{s.status}</span></td>
              <td style={{ fontSize: '12px' }}>{new Date(s.expiresAt).toLocaleString()}</td>
              <td>{s.calendar?.user?.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecurityPanel() {
  return (
    <div className="stats-grid animate-stagger">
      <div className="stat-card">
        <span className="stat-icon">🔐</span>
        <div className="stat-label">Encryption</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>AES-256-GCM</div>
        <div className="stat-change positive">✓ Active</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🛡️</span>
        <div className="stat-label">Auth Protocol</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>OAuth 2.0</div>
        <div className="stat-change positive">✓ Secure</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🚫</span>
        <div className="stat-label">Search Indexing</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>Blocked</div>
        <div className="stat-change positive">✓ Not indexed</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🔒</span>
        <div className="stat-label">SQL Injection</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>Protected</div>
        <div className="stat-change positive">✓ Prisma ORM</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🧱</span>
        <div className="stat-label">XSS Prevention</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>Active</div>
        <div className="stat-change positive">✓ Helmet + CSP</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">⚡</span>
        <div className="stat-label">Rate Limiting</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>Enabled</div>
        <div className="stat-change positive">✓ 100 req/15min</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🍪</span>
        <div className="stat-label">Cookies</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>HttpOnly</div>
        <div className="stat-change positive">✓ Secure + SameSite</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">📝</span>
        <div className="stat-label">Audit Logs</div>
        <div className="stat-value" style={{ fontSize: '20px', color: 'var(--success)' }}>Immutable</div>
        <div className="stat-change positive">✓ Append-only</div>
      </div>
    </div>
  );
}
