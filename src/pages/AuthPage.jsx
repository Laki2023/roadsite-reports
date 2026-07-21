import { useState } from 'react';
import { signIn, signUp } from '../lib/supabase';

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (!form.fullName.trim()) return setError('Full name is required.');
      if (form.password.length < 8) return setError('Password must be at least 8 characters.');
      if (form.password !== form.confirm) return setError('Passwords do not match.');
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { data, error } = await signIn(form.email, form.password);
        if (error) throw error;
        onAuth(data.user);
      } else {
        const { data, error } = await signUp(form.email, form.password, form.fullName);
        if (error) throw error;
        setMode('registered');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  if (mode === 'registered') {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Registration received</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
            Your account has been created and is <strong>pending approval</strong> by the site administrator.
            You will be notified once your role is assigned and access is granted.
          </p>
          <p style={{ color: 'var(--gray-400)', fontSize: 12, marginBottom: 20 }}>
            Check your email to verify your address first, then wait for admin approval.
          </p>
          <button className="btn btn-primary btn-full" onClick={() => setMode('login')}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">🛣</div>
          <h1>RoadSite Reports</h1>
          <p>Resident Engineer Field Reporting System</p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Full name</label>
              <input
                type="text"
                placeholder="e.g. James Mwangi"
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label>Confirm password</label>
              <input
                type="password"
                placeholder="Re-enter your password"
                value={form.confirm}
                onChange={e => set('confirm', e.target.value)}
                required
              />
            </div>
          )}

          {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
            style={{ padding: '11px', fontSize: 14 }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="divider"><span>{mode === 'login' ? 'New to RoadSite?' : 'Already registered?'}</span></div>

        <button
          className="btn btn-ghost btn-full"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        >
          {mode === 'login' ? 'Create a new account' : 'Sign in instead'}
        </button>

        {mode === 'login' && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', marginTop: 16 }}>
            Don't have access yet? Register and await administrator approval.
          </p>
        )}
      </div>
    </div>
  );
}
