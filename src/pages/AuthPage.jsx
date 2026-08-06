import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Eng.', 'Dr.', 'Prof.', 'Hon.', 'Arch.', 'QS.'];
const PROFESSIONS = [
  'Civil Engineer', 'Structural Engineer', 'Highway Engineer', 'Geotechnical Engineer',
  'Environmental Engineer', 'Surveyor', 'Land Surveyor', 'Quantity Surveyor',
  'Architect', 'Materials Engineer', 'Project Manager', 'Construction Manager',
  'Site Inspector', 'Laboratory Technician', 'Environmental Officer',
  'Health & Safety Officer', 'Accounts Officer', 'Other'
];
const KENYAN_REGIONS = [
  'Nairobi','Central','Coast','Eastern','North Eastern','Nyanza','Rift Valley','Western'
];
const DESIGNATIONS_SIGNUP = [
  'Inspector','Surveyor','Materials Technician','Resident Engineer','Engineer',
  'Environmental Officer','Accounts Officer','Project Manager','Other'
];

export default function AuthPage({ showToast }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profession, setProfession] = useState('');
  const [region, setRegion] = useState('');
  const [county, setCounty] = useState('');
  const [designation, setDesignation] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const displayName = title ? `${title} ${fullName}` : fullName;
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: displayName } }
        });
        if (err) throw err;
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: displayName,
            email,
            phone: phone || null,
            title: title || null,
            profession: profession || null,
            designation: designation || 'Inspector',
            region: region || null,
            county: county || null,
            bio: bio || null,
            role: 'pending',
          });
        }
        setSuccess(true);
        showToast('Account created! Awaiting admin approval.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    const displayName = title ? `${title} ${fullName}` : fullName;
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2>Registration Complete</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '16px 0' }}>
            Your account has been created and is pending approval by an administrator.
            You'll be able to sign in once your account is approved.
          </p>
          <div style={{ textAlign: 'left', background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius)', marginTop: 12, fontSize: 13 }}>
            <div><strong>Name:</strong> {displayName}</div>
            <div><strong>Email:</strong> {email}</div>
            {profession && <div><strong>Profession:</strong> {profession}</div>}
            {phone && <div><strong>Phone:</strong> {phone}</div>}
            {designation && <div><strong>Designation:</strong> {designation}</div>}
            {region && <div><strong>Region:</strong> {region}</div>}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 24 }}
            onClick={() => { setSuccess(false); setIsLogin(true); }}>
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>RoadSite Reports</h1>
        <p className="auth-sub">Road Construction Field Reporting & Quality Management</p>

        {error && (
          <div style={{
            background: 'var(--danger-dim)', color: 'var(--danger)',
            padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Title</label>
                  <select value={title} onChange={e => setTitle(e.target.value)}>
                    <option value="">—</option>
                    {TITLES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Collins Olaki Amayi" required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+254 7XX XXX XXX" />
                </div>
                <div className="form-group">
                  <label>Profession</label>
                  <select value={profession} onChange={e => setProfession(e.target.value)}>
                    <option value="">Select profession...</option>
                    {PROFESSIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Your Designation</label>
                  <select value={designation} onChange={e => setDesignation(e.target.value)}>
                    <option value="">Select...</option>
                    {DESIGNATIONS_SIGNUP.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Region</label>
                  <select value={region} onChange={e => setRegion(e.target.value)}>
                    <option value="">Select region...</option>
                    {KENYAN_REGIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>County</label>
                <input type="text" value={county} onChange={e => setCounty(e.target.value)}
                  placeholder="e.g. Murang'a" />
              </div>

              <div className="form-group">
                <label>Brief Introduction</label>
                <textarea rows={2} value={bio} onChange={e => setBio(e.target.value)}
                  placeholder="e.g. 5 years experience in road construction supervision, EBK registered..."
                  style={{ fontSize: 13 }} />
              </div>

              <div style={{ background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                Only Name, Email and Password are required. All other fields are optional but help the admin process your registration faster.
              </div>
            </>
          )}

          <div className="form-group">
            <label>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <label>Password *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}
            style={{ width: '100%', marginTop: 8 }}>
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
