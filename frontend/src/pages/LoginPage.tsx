import React, { useState } from 'react';
import { authService } from '../services/authService';
import { useSessionStore } from '../store/sessionStore';

interface LoginPageProps {
  onSwitchToRegister: () => void;
  onLoginSuccess: () => void;
}

// ── Shared style tokens (inline, no globals needed) ──────────────────────────
const INPUT_BASE: React.CSSProperties = {
  width: '100%',
  height: '48px',
  padding: '0 14px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #E8E9EB',
  borderRadius: '8px',
  color: '#44475B',
  fontSize: '0.92rem',
  outline: 'none',
  transition: 'border-color 0.18s ease',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const LABEL_BASE: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: '#7C7E8C',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToRegister, onLoginSuccess }) => {
  const [email, setEmail] = useState('trader@groww.in');
  const [password, setPassword] = useState('securepassword123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setUserId = useSessionStore((state) => state.setUserId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await authService.login(email, password);
      setUserId(data.user.id);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1.5rem',
        backgroundColor: '#F4F5F7',
        fontFamily: "'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0',
        }}
      >
        {/* ── Brand Header (above card) ────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          {/* Groww circular logo */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #00D09C 0%, #00B386 100%)',
              marginBottom: '14px',
              boxShadow: '0 4px 12px rgba(0, 208, 156, 0.25)',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3 13h-4v-2h2v-2h-2c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h4v2h-4v2h2c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2z"
                fill="white"
              />
            </svg>
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#44475B',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Login to Smart Watchlist
          </h1>
          <p style={{ color: '#7C7E8C', fontSize: '0.875rem', marginTop: '6px' }}>
            Track your portfolio in real-time
          </p>
        </div>

        {/* ── Card ────────────────────────────────────────────────────────────── */}
        <div
          style={{
            width: '100%',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E8E9EB',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
          }}
        >
          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(235, 91, 60, 0.08)',
                border: '1px solid rgba(235, 91, 60, 0.25)',
                borderRadius: '8px',
                color: '#EB5B3C',
                fontSize: '0.84rem',
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Email */}
            <div>
              <label htmlFor="login-email" style={LABEL_BASE}>Email Address</label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={INPUT_BASE}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#00D09C'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E8E9EB'; }}
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label htmlFor="login-password" style={{ ...LABEL_BASE, marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#00D09C',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={INPUT_BASE}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#00D09C'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E8E9EB'; }}
              />
            </div>

            {/* CTA Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '0.25rem',
                width: '100%',
                height: '48px',
                background: loading ? '#7DD9C3' : '#00D09C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.18s ease',
                fontFamily: 'inherit',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = '#00BB8A';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.background = '#00D09C';
              }}
            >
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
        </div>

        {/* ── Footer link (below card) ─────────────────────────────────────── */}
        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#7C7E8C', marginTop: '20px' }}>
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            style={{
              background: 'none',
              border: 'none',
              color: '#00D09C',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              textDecoration: 'none',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          >
            Sign up free
          </button>
        </p>
      </div>
    </div>
  );
};
