import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const DEMO_EMAIL = 'demo@paperdigester.com';
const DEMO_PASSWORD = 'paperdigester2026';

const inputStyle = {
  width: '100%', padding: '10px 12px',
  border: '0.5px solid #d1d5db', borderRadius: 7,
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

export default function AuthPage() {
  const { signUp, signIn, error } = useAuth();
  const [mode, setMode]               = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [successMessage, setSuccess]  = useState('');
  const [showForgot, setShowForgot]   = useState(false);
  const [demoError, setDemoError]     = useState('');

  async function handleDemoLogin() {
    setSubmitting(true);
    setDemoError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (error) throw error;
    } catch (e) {
      setDemoError('Demo login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const switchMode = (newMode) => {
    setMode(newMode);
    setSuccess('');
    setShowForgot(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess('');

    if (mode === 'signup') {
      const result = await signUp(email, password);
      if (result.success) {
        setSuccess('Account created! You can now sign in.');
        setMode('signin');
        setPassword('');
      }
    } else {
      await signIn(email, password);
    }

    setSubmitting(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#f9fafb', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#fff', borderRadius: 14,
        border: '0.5px solid #e0e3e8',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        padding: '36px 32px',
      }}>
        {/* Logo + tagline */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1B4F9C', marginBottom: 6 }}>
            📄 Paper Digester
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Your AI research companion
          </div>
        </div>

        {/* Tab toggle */}
        <div style={{
          display: 'flex', background: '#f3f4f6',
          borderRadius: 8, padding: 3, marginBottom: 24,
        }}>
          {['signin', 'signup'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#1B4F9C' : '#6b7280',
                fontWeight: mode === m ? 600 : 500,
                fontSize: 13,
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {mode === 'signin' && (
            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#1B4F9C', fontSize: 12, cursor: 'pointer', padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {showForgot && (
            <div style={{
              background: '#EAF3DE', color: '#3B6D11',
              fontSize: 12, padding: '8px 12px',
              borderRadius: 6, marginBottom: 14,
            }}>
              Check your email for a reset link.
            </div>
          )}

          {error && (
            <div style={{
              background: '#fef2f2', border: '0.5px solid #fca5a5',
              color: '#dc2626', fontSize: 13,
              padding: '10px 12px', borderRadius: 6, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div style={{
              background: '#f0fdf4', border: '0.5px solid #86efac',
              color: '#16a34a', fontSize: 13,
              padding: '10px 12px', borderRadius: 6, marginBottom: 14,
            }}>
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '11px',
              background: submitting ? '#9ca3af' : '#1B4F9C',
              color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 600, fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting
              ? 'Please wait…'
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Try Demo */}
        <div style={{ margin: '20px 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: '0.5px', background: '#e0e3e8' }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
          <div style={{ flex: 1, height: '0.5px', background: '#e0e3e8' }} />
        </div>

        <button
          onClick={handleDemoLogin}
          disabled={submitting}
          style={{
            width: '100%', padding: '10px', borderRadius: 8,
            border: '0.5px solid #d1d5db',
            background: '#f9fafb', color: '#374151',
            fontSize: 14, fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}
        >
          ▶ Try Demo
        </button>

        {demoError && (
          <div style={{
            background: '#fef2f2', border: '0.5px solid #fca5a5',
            color: '#dc2626', fontSize: 12,
            padding: '8px 12px', borderRadius: 6, marginTop: 8,
          }}>
            {demoError}
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          Explore with pre-loaded research papers
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#9ca3af' }}>
          Free forever · No credit card
        </div>
      </div>
    </div>
  );
}
