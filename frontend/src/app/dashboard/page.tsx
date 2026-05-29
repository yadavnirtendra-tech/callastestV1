'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4400';

interface UserSession {
  id: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  googleConnected: boolean;
  microsoftConnected: boolean;
}

interface DashboardStats {
  users: { total: number; active: number };
  events: { total: number; synced: number };
  sync: { failed: number; recentTransactions: any[] };
  conflicts: { today: number };
}

interface CalendarEvent {
  id: string;
  calendarId: string;
  globalEventUuid: string;
  sourcePlatform: 'GOOGLE' | 'MICROSOFT';
  sourceEventId: string;
  mirrorEventId: string | null;
  mirrorPlatform: 'GOOGLE' | 'MICROSOFT' | null;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isAllDay: boolean;
  location: string;
  status: string;
  visibility: string;
  showAs: string;
  organizerEmail: string;
  organizerName: string;
  isOrganizer: boolean;
  attendees: any[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Admin Dashboard State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loadingAdminStats, setLoadingAdminStats] = useState(true);

  // User Dashboard State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Create Event Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');
  const [formLocation, setFormLocation] = useState('');
  const [formSyncGoogle, setFormSyncGoogle] = useState(false);
  const [formSyncMicrosoft, setFormSyncMicrosoft] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Details & Edit Form State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('10:00');
  const [editLocation, setEditLocation] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Decline State
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineCustomMessage, setDeclineCustomMessage] = useState('');
  const [useCustomDecline, setUseCustomDecline] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    if (session) {
      if (session.role === 'ADMIN') {
        fetchAdminStats();
        const interval = setInterval(fetchAdminStats, 30000);
        return () => clearInterval(interval);
      } else {
        fetchUserEvents();
      }
    }
  }, [session]);

  // Set default form settings when OAuth connects
  useEffect(() => {
    if (session) {
      setFormSyncGoogle(session.googleConnected);
      setFormSyncMicrosoft(session.microsoftConnected);
    }
  }, [session]);

  async function fetchSession() {
    try {
      const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.data.authenticated) {
        setSession(data.data.user);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      router.push('/');
    } finally {
      setLoadingSession(false);
    }
  }

  async function fetchAdminStats() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard/stats`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoadingAdminStats(false);
    }
  }

  async function fetchUserEvents() {
    setLoadingEvents(true);
    try {
      const res = await fetch(`${API_BASE}/api/events`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setEvents(data.data.events);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {}
    router.push('/');
  }

  // Handle Event Creation
  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');

    if (!formTitle || !formDate || !formStartTime || !formEndTime) {
      setCreateError('Title, date, and times are required.');
      return;
    }

    const startDateTime = new Date(`${formDate}T${formStartTime}:00`);
    const endDateTime = new Date(`${formDate}T${formEndTime}:00`);

    if (endDateTime <= startDateTime) {
      setCreateError('End time must be after start time.');
      return;
    }

    setCreateLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          location: formLocation,
          syncGoogle: formSyncGoogle,
          syncMicrosoft: formSyncMicrosoft,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        // Clear fields
        setFormTitle('');
        setFormDescription('');
        setFormLocation('');
        fetchUserEvents();
      } else {
        setCreateError(data.error?.message || 'Failed to create event');
      }
    } catch (err) {
      setCreateError('Network error occurred.');
    } finally {
      setCreateLoading(false);
    }
  }

  // Handle Event Update
  async function handleUpdateEvent(e: React.FormEvent) {
    e.preventDefault();
    setEditError('');

    if (!editTitle || !editDate || !editStartTime || !editEndTime || !selectedEvent) {
      setEditError('Title, date, and times are required.');
      return;
    }

    const startDateTime = new Date(`${editDate}T${editStartTime}:00`);
    const endDateTime = new Date(`${editDate}T${editEndTime}:00`);

    if (endDateTime <= startDateTime) {
      setEditError('End time must be after start time.');
      return;
    }

    setEditLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/events/${selectedEvent.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          location: editLocation,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowDetailsModal(false);
        setIsEditMode(false);
        fetchUserEvents();
      } else {
        setEditError(data.error?.message || 'Failed to update event');
      }
    } catch (err) {
      setEditError('Network error occurred.');
    } finally {
      setEditLoading(false);
    }
  }

  // Handle Event Deletion
  async function handleDeleteEvent() {
    if (!selectedEvent) return;
    if (!confirm('Are you sure you want to delete this event? This will remove it from all synced calendars.')) return;

    try {
      const res = await fetch(`${API_BASE}/api/events/${selectedEvent.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setShowDetailsModal(false);
        fetchUserEvents();
      }
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  }

  // Handle Decline Invitation
  async function handleDeclineEvent() {
    if (!selectedEvent) return;
    setDeclineLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/events/${selectedEvent.id}/decline`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customMessage: useCustomDecline ? declineCustomMessage : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowDetailsModal(false);
        setShowDeclineForm(false);
        setDeclineCustomMessage('');
        fetchUserEvents();
      } else {
        alert(data.error?.message || 'Failed to decline event');
      }
    } catch (err) {
      alert('Network error occurred.');
    } finally {
      setDeclineLoading(false);
    }
  }

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Calculate month days grid
  const getDaysInMonth = (year: number, month: number) => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days = [];

    // Prev month days padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill grid (multiple of 7)
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const daysGrid = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  // Get events on a specific day
  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  // Open creation modal for date
  const handleOpenCreateModal = (date: Date) => {
    setSelectedDate(date);
    const dateStr = date.toISOString().split('T')[0];
    setFormDate(dateStr);
    setShowCreateModal(true);
  };

  // Open event details modal
  const handleOpenDetailsModal = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering cell click
    setSelectedEvent(event);
    
    // Preset edit form fields
    setEditTitle(event.title);
    setEditDescription(event.description);
    const dateStr = new Date(event.startTime).toISOString().split('T')[0];
    setEditDate(dateStr);
    
    const startObj = new Date(event.startTime);
    const endObj = new Date(event.endTime);
    setEditStartTime(`${String(startObj.getHours()).padStart(2, '0')}:${String(startObj.getMinutes()).padStart(2, '0')}`);
    setEditEndTime(`${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`);
    setEditLocation(event.location || '');
    
    // Reset states
    setIsEditMode(false);
    setShowDeclineForm(false);
    setDeclineCustomMessage('');
    setShowDetailsModal(true);
  };

  if (loadingSession) {
    return (
      <div className="login-container">
        <div style={{ color: 'var(--text-secondary)' }}>Loading session...</div>
      </div>
    );
  }

  // ============================================================
  // ADMIN DASHBOARD VIEW
  // ============================================================
  if (session?.role === 'ADMIN') {
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
            <button className="nav-item" onClick={handleLogout}>
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
                    {loadingAdminStats ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.users.active || 0}
                  </div>
                  <div className="stat-change positive">
                    ↑ {stats?.users.total || 0} total
                  </div>
                </div>

                <div className="stat-card">
                  <span className="stat-icon">📅</span>
                  <div className="stat-label">Events Synced</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>
                    {loadingAdminStats ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.events.synced || 0}
                  </div>
                  <div className="stat-change positive">
                    {stats?.events.total || 0} total events
                  </div>
                </div>

                <div className="stat-card">
                  <span className="stat-icon">❌</span>
                  <div className="stat-label">Failed Syncs</div>
                  <div className="stat-value" style={{ color: stats?.sync.failed ? 'var(--error)' : 'var(--success)' }}>
                    {loadingAdminStats ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.sync.failed || 0}
                  </div>
                  <div className={`stat-change ${stats?.sync.failed ? 'negative' : 'positive'}`}>
                    {stats?.sync.failed ? '⚠ Needs attention' : '✓ All clear'}
                  </div>
                </div>

                <div className="stat-card">
                  <span className="stat-icon">⚡</span>
                  <div className="stat-label">Conflicts Today</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>
                    {loadingAdminStats ? <div className="skeleton" style={{ width: '80px', height: '36px' }} /> : stats?.conflicts.today || 0}
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
                  <button className="btn btn-ghost btn-sm" onClick={fetchAdminStats}>🔄 Refresh</button>
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
                            <p>No sync transactions yet.</p>
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
                <p className="page-subtitle">Manage synced users and their email preferences</p>
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

  // ============================================================
  // USER MASTER CALENDAR & CRUD VIEW
  // ============================================================
  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🔄</div>
          <div>
            <div className="sidebar-logo-text">CalendarSync</div>
            <div className="sidebar-logo-sub">Master Scheduler</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item active">
            <span className="nav-item-icon">📅</span>
            <span>Master Calendar</span>
          </button>
        </nav>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
          <div style={{ padding: '0 12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Signed in as:<br />
            <strong style={{ color: 'var(--text-primary)' }}>{session?.displayName}</strong>
          </div>
          <button className="nav-item" onClick={handleLogout}>
            <span className="nav-item-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="animate-in">
          <div className="page-header">
            <h1 className="page-title">Master Calendar</h1>
            <p className="page-subtitle">Unified view of your connected Google Calendar and Microsoft Outlook events</p>
          </div>

          {/* Connection Panel */}
          <div className="connections-grid animate-stagger">
            <div className="connection-card">
              <span className="connection-icon">📧</span>
              <div className="connection-details">
                <div className="connection-name">Google Calendar</div>
                <div className="connection-status">
                  {session?.googleConnected ? (
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Connected</span>
                  ) : (
                    <span>Not Linked</span>
                  )}
                </div>
              </div>
              {!session?.googleConnected && (
                <a href={`${API_BASE}/auth/google`} className="btn btn-ghost btn-sm">Connect</a>
              )}
            </div>

            <div className="connection-card">
              <span className="connection-icon">📨</span>
              <div className="connection-details">
                <div className="connection-name">Microsoft Outlook</div>
                <div className="connection-status">
                  {session?.microsoftConnected ? (
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Connected</span>
                  ) : (
                    <span>Not Linked</span>
                  )}
                </div>
              </div>
              {!session?.microsoftConnected && (
                <a href={`${API_BASE}/auth/microsoft`} className="btn btn-ghost btn-sm">Connect</a>
              )}
            </div>
          </div>

          {/* Master Calendar Container */}
          <div className="calendar-container">
            <div className="calendar-header">
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost btn-sm" onClick={handlePrevMonth}>◀ Prev</button>
                <button className="btn btn-ghost btn-sm" onClick={handleNextMonth}>Next ▶</button>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, textTransform: 'capitalize' }}>
                {monthName} {currentDate.getFullYear()}
              </h2>
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenCreateModal(new Date())}>
                ➕ Create Event
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="calendar-grid">
              {/* Day Labels */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(label => (
                <div key={label} className="calendar-day-label">{label}</div>
              ))}

              {/* Day Cells */}
              {daysGrid.map((day, idx) => {
                const dayEvents = getEventsForDate(day.date);
                const isToday = new Date().toDateString() === day.date.toDateString();

                return (
                  <div
                    key={idx}
                    className={`calendar-day-cell ${day.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}`}
                    onClick={() => handleOpenCreateModal(day.date)}
                  >
                    <span className="calendar-day-number">{day.date.getDate()}</span>
                    <div className="calendar-events-list">
                      {dayEvents.map(evt => {
                        const isBoth = evt.mirrorEventId && (evt.sourcePlatform && evt.mirrorPlatform);
                        const chipClass = isBoth ? 'both' : evt.sourcePlatform === 'GOOGLE' ? 'google' : 'microsoft';
                        return (
                          <div
                            key={evt.id}
                            className={`calendar-event-chip ${chipClass}`}
                            onClick={(e) => handleOpenDetailsModal(evt, e)}
                          >
                            {evt.title || '(No title)'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* ============================================================
          CREATE EVENT MODAL
          ============================================================ */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            <h2 className="modal-title">Create Master Event</h2>

            {createError && (
              <div className="badge badge-error" style={{ width: '100%', padding: '8px', marginBottom: '16px', borderRadius: '6px', justifyContent: 'center' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateEvent}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Event Title</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Strategy Meeting"
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Description</label>
                <textarea
                  className="form-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', minHeight: '60px' }}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Outline next quarter roadmap..."
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Date</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Start Time</label>
                  <input
                    type="time"
                    className="form-input"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    value={formStartTime}
                    onChange={e => setFormStartTime(e.target.value)}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>End Time</label>
                  <input
                    type="time"
                    className="form-input"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    value={formEndTime}
                    onChange={e => setFormEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Location</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                  value={formLocation}
                  onChange={e => setFormLocation(e.target.value)}
                  placeholder="Conference Room A / Google Meet"
                />
              </div>

              <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Sync Destination Options</div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: session?.googleConnected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={formSyncGoogle}
                      onChange={e => setFormSyncGoogle(e.target.checked)}
                      disabled={!session?.googleConnected}
                    />
                    Google Calendar
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: session?.microsoftConnected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={formSyncMicrosoft}
                      onChange={e => setFormSyncMicrosoft(e.target.checked)}
                      disabled={!session?.microsoftConnected}
                    />
                    Outlook Calendar
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', borderRadius: '6px' }}
                disabled={createLoading}
              >
                {createLoading ? 'Creating Event...' : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          EVENT DETAILS / EDIT / DECLINE MODAL
          ============================================================ */}
      {showDetailsModal && selectedEvent && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowDetailsModal(false)}>✕</button>
            <h2 className="modal-title">{isEditMode ? 'Edit Event Details' : 'Event Details'}</h2>

            {editError && (
              <div className="badge badge-error" style={{ width: '100%', padding: '8px', marginBottom: '16px', borderRadius: '6px', justifyContent: 'center' }}>
                {editError}
              </div>
            )}

            {!isEditMode && !showDeclineForm && (
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {selectedEvent.title}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
                  {selectedEvent.description || <em>No description provided.</em>}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', padding: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div>📅 <strong>Date:</strong> {new Date(selectedEvent.startTime).toLocaleDateString()}</div>
                  <div>🕒 <strong>Time:</strong> {new Date(selectedEvent.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedEvent.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  {selectedEvent.location && <div>📍 <strong>Location:</strong> {selectedEvent.location}</div>}
                  <div>🔗 <strong>Source:</strong> {selectedEvent.sourcePlatform?.toUpperCase()}</div>
                  {selectedEvent.mirrorPlatform && <div>🔄 <strong>Mirrored to:</strong> {selectedEvent.mirrorPlatform?.toUpperCase()}</div>}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsEditMode(true)}>✏ Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={handleDeleteEvent}>🗑 Delete</button>
                  {/* Show decline option if user is not the organizer or if they want to decline it */}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', borderColor: 'var(--error)', color: 'var(--error)' }}
                    onClick={() => setShowDeclineForm(true)}
                  >
                    Declined / Reject
                  </button>
                </div>
              </div>
            )}

            {/* Decline/Reject Sub-Form */}
            {showDeclineForm && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                  Decline Invitation
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  This will remove the event from your calendars and notify the organizer.
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={useCustomDecline}
                      onChange={e => setUseCustomDecline(e.target.checked)}
                    />
                    Add custom rejection message
                  </label>
                </div>

                {useCustomDecline && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Custom Rejection Email Message</label>
                    <textarea
                      className="form-input"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', minHeight: '80px' }}
                      value={declineCustomMessage}
                      onChange={e => setDeclineCustomMessage(e.target.value)}
                      placeholder="Hi, I won't be able to make it because I have an overlapping appointment..."
                      required
                    />
                  </div>
                )}

                {!useCustomDecline && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(102,126,234,0.05)', padding: '10px', borderRadius: '6px', marginBottom: '20px', border: '1px dashed var(--border)' }}>
                    ℹ The system will automatically search your calendar and suggest alternative open slots in a polite decline email.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-danger btn-sm" onClick={handleDeclineEvent} disabled={declineLoading}>
                    {declineLoading ? 'Sending Decline...' : 'Send Decline'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowDeclineForm(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Edit Mode Form */}
            {isEditMode && (
              <form onSubmit={handleUpdateEvent}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Title</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Description</label>
                  <textarea
                    className="form-input"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', minHeight: '60px' }}
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Date</label>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Start Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                      value={editStartTime}
                      onChange={e => setEditStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>End Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                      value={editEndTime}
                      onChange={e => setEditEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Location</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    value={editLocation}
                    onChange={e => setEditLocation(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={editLoading}>
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditMode(false)}>Back</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADMIN COMPONENTS (RETAINED FROM ORIGINAL IMPLEMENTATION)
// ============================================================

function SyncMonitorPanel() {
  const [transactions, setTransactions] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/admin/sync/transactions?limit=50`, { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setTransactions(d.data.transactions));
  }, []);

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">All Sync Transactions</h3>
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

const EMAIL_PROVIDER_LABELS: Record<string, string> = {
  AUTO: '🤖 Auto (smart route)',
  GOOGLE: '📧 Gmail API',
  MICROSOFT: '📨 MS Graph',
  SENDGRID: '📬 SendGrid SMTP',
};

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/users?limit=100`, { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setUsers(d.data.users));
  }, []);

  async function changeEmailProvider(userId: string, provider: string) {
    setUpdatingId(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/email-provider`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailProvider: provider }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, emailProvider: provider } : u));
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">All Users</h3>
      </div>
      <table>
        <thead>
          <tr><th>User</th><th>Role</th><th>Google</th><th>Microsoft</th><th>Email Route</th><th>Calendars</th><th>Status</th><th>Last Sync</th></tr>
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
              <td>
                <select
                  value={u.emailProvider || 'AUTO'}
                  disabled={updatingId === u.id}
                  onChange={e => changeEmailProvider(u.id, e.target.value)}
                  style={{
                    background: '#1e2130',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    cursor: updatingId === u.id ? 'wait' : 'pointer',
                  }}
                >
                  {Object.entries(EMAIL_PROVIDER_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </td>
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
    fetch(`${API_BASE}/api/admin/conflicts`, { credentials: 'include' })
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
    fetch(`${API_BASE}/api/admin/audit-logs?limit=100`, { credentials: 'include' })
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
    fetch(`${API_BASE}/api/admin/webhooks`, { credentials: 'include' })
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
  const [sec, setSec] = useState<any>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/admin/security`, { credentials: 'include' })
      .then(r => r.json()).then(d => d.success && setSec(d.data));
  }, []);

  return (
    <div className="stats-grid animate-stagger">
      <div className="stat-card">
        <span className="stat-icon">🔐</span>
        <div className="stat-label">Encryption</div>
        <div className="stat-value" style={{ fontSize: '18px', color: 'var(--success)' }}>{sec?.encryption?.algorithm || 'AES-256-GCM'}</div>
        <div className="stat-change positive">Active</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🛡️</span>
        <div className="stat-label">Auth Protocol</div>
        <div className="stat-value" style={{ fontSize: '18px', color: 'var(--success)' }}>{sec?.authProtocol || 'OAuth 2.0'}</div>
        <div className="stat-change positive">Secure</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">📝</span>
        <div className="stat-label">Audit Log Entries</div>
        <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>{sec?.auditLogs?.total ?? '—'}</div>
        <div className="stat-change positive">Immutable / Append-only</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">⚠️</span>
        <div className="stat-label">Failed Logins (24h)</div>
        <div className="stat-value" style={{ color: sec?.threats?.recentFailedLogins ? 'var(--error)' : 'var(--success)' }}>
          {sec?.threats?.recentFailedLogins ?? '—'}
        </div>
        <div className={`stat-change ${sec?.threats?.recentFailedLogins ? 'negative' : 'positive'}`}>
          {sec?.threats?.recentFailedLogins ? 'Needs review' : 'All clear'}
        </div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🔄</span>
        <div className="stat-label">Sync Loops Prevented</div>
        <div className="stat-value" style={{ color: 'var(--success)' }}>{sec?.threats?.loopsPrevented ?? '—'}</div>
        <div className="stat-change positive">Fingerprint protection</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🔗</span>
        <div className="stat-label">Active Webhooks</div>
        <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>{sec?.webhooks?.active ?? '—'}</div>
        <div className={`stat-change ${sec?.webhooks?.expired ? 'negative' : 'positive'}`}>
          {sec?.webhooks?.expired ? `${sec.webhooks.expired} expired` : 'All healthy'}
        </div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🚫</span>
        <div className="stat-label">Invalid Webhooks</div>
        <div className="stat-value" style={{ color: sec?.threats?.invalidWebhooks ? 'var(--warning)' : 'var(--success)' }}>
          {sec?.threats?.invalidWebhooks ?? '—'}
        </div>
        <div className="stat-change positive">Spoofing attempts blocked</div>
      </div>
      <div className="stat-card">
        <span className="stat-icon">🔒</span>
        <div className="stat-label">SQL Injection</div>
        <div className="stat-value" style={{ fontSize: '16px', color: 'var(--success)' }}>Protected</div>
        <div className="stat-change positive">{sec?.features?.sqlInjectionProtection || 'Prisma ORM'}</div>
      </div>
    </div>
  );
}
