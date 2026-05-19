'use client';

export default function LoginPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4400';

  return (
    <div className="login-container">
      <div className="login-card animate-in">
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px',
            boxShadow: '0 0 30px rgba(102, 126, 234, 0.3)',
          }}>
            🔄
          </div>
        </div>

        <h1 className="login-title">CalendarSync Enterprise</h1>
        <p className="login-subtitle">Sign in to access the admin dashboard</p>

        <a href={`${API_BASE}/auth/google`} className="login-btn">
          <span className="login-btn-icon">📧</span>
          Continue with Google
        </a>

        <a href={`${API_BASE}/auth/microsoft`} className="login-btn">
          <span className="login-btn-icon">📨</span>
          Continue with Microsoft
        </a>

        <div className="login-security-note">
          <span>🔒</span>
          <span>
            This is a private enterprise application. Access is restricted to authorized personnel only.
            Your session is encrypted with AES-256-GCM.
          </span>
        </div>
      </div>
    </div>
  );
}
