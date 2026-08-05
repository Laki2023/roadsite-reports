import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthPage({ showToast }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } }
        });
        if (err) throw err;
        // Create profile
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: fullName,
            email,
            phone,
            role: 'pending',
          });
        }
        showToast('Account created. Awaiting admin approval.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>RoadSite Reports</h1>
        <p className="auth-sub">Road Construction Field Reporting & Quality Management</p>

        {error && (
          <div style={{
            background: 'var(--danger-dim)', color: 'var(--danger)',
            padding: '10px 14px', borderRadius: 'var(--radius)',
            fontSize: 13, marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Collins Amayi" required />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+254 7XX XXX XXX" />
              </div>
            </>
          )}
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? "Don't have an account? " : 'Already registered? '}
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }}>
            {isLogin ? 'Register' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
