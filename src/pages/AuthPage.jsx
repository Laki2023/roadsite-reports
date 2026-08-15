import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Eng.', 'Dr.', 'Prof.', 'Hon.', 'Arch.', 'QS.', 'Surv.', 'Capt.', 'Cpl.'];

const PARTY_OPTIONS = [
  { value: 'client', label: 'Client / Employer', icon: '🏛️', desc: 'KeNHA, KURA, KeRRA, County Govt', color: '#2563eb' },
  { value: 'engineer', label: 'Engineer (Consulting Firm)', icon: '📐', desc: 'Supervision consultant', color: '#6366f1' },
  { value: 'project_manager', label: 'Project Manager', icon: '👔', desc: 'PM overseeing the project', color: '#0891b2' },
  { value: 'engineer_rep', label: "Engineer's Representative", icon: '👷', desc: 'RE & site supervision team', color: '#059669' },
  { value: 'contractor', label: 'Contractor', icon: '🏗️', desc: 'Main contractor', color: '#e87b35' },
  { value: 'subcontractor', label: 'Subcontractor', icon: '🔧', desc: 'Nominated or domestic sub', color: '#8b5cf6' },
];

const POSITIONS = {
  client: ['Director General', 'Deputy Director General', 'Director of Roads', 'Regional Manager', 'Project Coordinator', 'Procurement Officer', 'Project Accountant'],
  engineer: ['Engineer', 'Team Leader', 'Deputy Team Leader', 'Project Engineer', 'Highway Engineer', 'Structural Engineer', 'Claims Specialist', 'Quantity Surveyor'],
  project_manager: ['Project Manager', 'Deputy Project Manager', 'Project Engineer', 'Assistant Project Engineer'],
  engineer_rep: ['Resident Engineer', 'Assistant RE', 'Inspector of Works (Roads)', 'Inspector of Works (Structures)', 'Materials Engineer', 'Surveyor', 'Quantity Surveyor', 'Environmental Specialist', 'Lab Technician'],
  contractor: ['Site Agent', 'Project Manager', 'Deputy Site Agent', 'General Foreman', 'Materials Engineer', 'Chief Surveyor', 'Plant Manager', 'QA/QC Manager', 'Safety Officer', 'Quantity Surveyor', 'Lab Technician'],
  subcontractor: ['Sub Site Agent', 'Sub Foreman', 'Sub Surveyor'],
};

const QUALIFICATIONS = [
  'BSc Civil Engineering', 'BSc Structural Engineering', 'BEng Highway Engineering',
  'MSc Civil Engineering', 'MSc Transport Engineering', 'MSc Structural Engineering',
  'Diploma Civil Engineering', 'Diploma Building & Construction',
  'Higher Diploma Highway Engineering', 'Certificate in Survey',
  'KCSE Certificate', 'Other',
];

export default function AuthPage({ showToast }) {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1); // 1: credentials, 2: profile, 3: party
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [party, setParty] = useState('');
  const [position, setPosition] = useState('');
  const [customPosition, setCustomPosition] = useState('');
  const [qualification, setQualification] = useState('');
  const [customQualification, setCustomQualification] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [regBody, setRegBody] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const finalPosition = position === '__custom__' ? customPosition : position;
  const finalQualification = qualification === 'Other' ? customQualification : qualification;

  async function handleSubmit(e) {
    e?.preventDefault();
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
            designation: finalPosition || null,
            bio: [
              party ? `Party: ${PARTY_OPTIONS.find(p => p.value === party)?.label || party}` : '',
              finalPosition ? `Position: ${finalPosition}` : '',
              finalQualification ? `Qualification: ${finalQualification}` : '',
              yearsExperience ? `Experience: ${yearsExperience} years` : '',
              regBody ? `Registration: ${regBody} ${regNumber}` : '',
              idNumber ? `ID: ${idNumber}` : '',
              bio || '',
            ].filter(Boolean).join(' | '),
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

  const inputStyle = { width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', transition: 'border 0.2s' };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

  if (success) {
    const displayName = title ? `${title} ${fullName}` : fullName;
    const partyInfo = PARTY_OPTIONS.find(p => p.value === party);
    return (
      <div className="auth-page">
        <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
          <div style={{ textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#05966920', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Registration complete</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>Your account is pending approval by the administrator</p>

            <div style={{ textAlign: 'left', background: 'var(--bg-hover)', padding: 16, borderRadius: 10, fontSize: 13, lineHeight: 1.8 }}>
              <div><strong>{displayName}</strong></div>
              <div style={{ color: 'var(--text-muted)' }}>{email}</div>
              {partyInfo && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${partyInfo.color}20`, color: partyInfo.color }}>
                    {partyInfo.icon} {partyInfo.label}
                  </span>
                </div>
              )}
              {finalPosition && <div style={{ marginTop: 4 }}>Position: {finalPosition}</div>}
              {finalQualification && <div>Qualification: {finalQualification}</div>}
              {yearsExperience && <div>Experience: {yearsExperience} years</div>}
              {regBody && <div>Registration: {regBody} {regNumber}</div>}
            </div>

            <button className="btn btn-primary" style={{ marginTop: 20, width: '100%', padding: 12 }}
              onClick={() => { setSuccess(false); setIsLogin(true); setStep(1); }}>
              Go to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--accent)' }}>RoadSite Reports</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>Road Construction Project Management Platform</p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden' }}>
          {/* Top accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #3b82f6, #059669, #e87b35)' }} />

          {error && (
            <div style={{ background: '#ef444415', color: '#ef4444', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16, border: '1px solid #ef444430' }}>{error}</div>
          )}

          {isLogin ? (
            /* ═══ LOGIN ═══ */
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px', textAlign: 'center' }}>Welcome back</h2>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" required />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Enter your password" required minLength={6} />
              </div>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: 12, fontSize: 14 }}>
                {loading ? '⏳ Signing in...' : 'Sign in'}
              </button>
            </div>
          ) : (
            /* ═══ REGISTRATION ═══ */
            <div>
              {/* Step indicators */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                {[1, 2, 3].map(s => (
                  <div key={s} onClick={() => s < step && setStep(s)} style={{
                    width: s === step ? 32 : 10, height: 10, borderRadius: 5, cursor: s < step ? 'pointer' : 'default',
                    background: s <= step ? '#059669' : 'var(--border)', transition: 'all 0.3s',
                  }} />
                ))}
              </div>

              {/* STEP 1: Credentials */}
              {step === 1 && (
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>Create your account</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 20px' }}>Step 1 of 3 — Login credentials</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>Title</label>
                      <select value={title} onChange={e => setTitle(e.target.value)} style={inputStyle}>
                        <option value="">—</option>
                        {TITLES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Full name *</label>
                      <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} placeholder="e.g. John Kamau Mwangi" required />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Email *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" required />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Password *</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Min 6 characters" required minLength={6} />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Phone number</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="+254 7XX XXX XXX" />
                  </div>
                  <button className="btn btn-primary" onClick={() => { if (!fullName || !email || !password) { setError('Name, email and password are required'); return; } setError(''); setStep(2); }}
                    style={{ width: '100%', padding: 12, fontSize: 14 }}>Next — Select your party →</button>
                </div>
              )}

              {/* STEP 2: Party Selection */}
              {step === 2 && (
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>Which party are you?</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 20px' }}>Step 2 of 3 — Select your organisation type</p>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {PARTY_OPTIONS.map(p => (
                      <div key={p.value} onClick={() => setParty(p.value)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer',
                          background: party === p.value ? `${p.color}12` : 'var(--bg-hover)',
                          border: `2px solid ${party === p.value ? p.color : 'transparent'}`,
                          borderRadius: 10, transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { if (party !== p.value) e.currentTarget.style.transform = 'translateX(4px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${p.color}18`, fontSize: 22, flexShrink: 0 }}>{p.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
                        </div>
                        {party === p.value && <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>✓</div>}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1, padding: 12 }}>← Back</button>
                    <button className="btn btn-primary" onClick={() => { if (!party) { setError('Please select your party'); return; } setError(''); setStep(3); }}
                      disabled={!party} style={{ flex: 2, padding: 12, fontSize: 14, opacity: party ? 1 : 0.5 }}>Next — Your details →</button>
                  </div>
                </div>
              )}

              {/* STEP 3: Professional Details */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>Professional details</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 20px' }}>
                    Step 3 of 3 — as {PARTY_OPTIONS.find(p => p.value === party)?.icon} {PARTY_OPTIONS.find(p => p.value === party)?.label}
                  </p>

                  {/* Position */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Position / designation *</label>
                    <select value={POSITIONS[party]?.includes(position) ? position : (position ? '__custom__' : '')}
                      onChange={e => { setPosition(e.target.value); if (e.target.value !== '__custom__') setCustomPosition(''); }}
                      style={inputStyle}>
                      <option value="">— Select your position —</option>
                      {(POSITIONS[party] || []).map(p => <option key={p} value={p}>{p}</option>)}
                      <option value="__custom__">＋ Other (type below)</option>
                    </select>
                    {(position === '__custom__' || (position && !POSITIONS[party]?.includes(position))) && (
                      <input type="text" value={customPosition} onChange={e => { setCustomPosition(e.target.value); setPosition('__custom__'); }}
                        style={{ ...inputStyle, marginTop: 6, border: '2px solid var(--accent)' }} placeholder="Type your position..." />
                    )}
                  </div>

                  {/* Qualification */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Highest qualification</label>
                    <select value={qualification} onChange={e => setQualification(e.target.value)} style={inputStyle}>
                      <option value="">— Select —</option>
                      {QUALIFICATIONS.map(q => <option key={q}>{q}</option>)}
                    </select>
                    {qualification === 'Other' && (
                      <input type="text" value={customQualification} onChange={e => setCustomQualification(e.target.value)}
                        style={{ ...inputStyle, marginTop: 6, border: '2px solid var(--accent)' }} placeholder="Type your qualification..." />
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>Years of experience</label>
                      <input type="number" value={yearsExperience} onChange={e => setYearsExperience(e.target.value)} style={inputStyle} placeholder="e.g. 8" />
                    </div>
                    <div>
                      <label style={labelStyle}>ID / passport no.</label>
                      <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)} style={inputStyle} placeholder="e.g. 12345678" />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>Registration body</label>
                      <select value={regBody} onChange={e => setRegBody(e.target.value)} style={inputStyle}>
                        <option value="">— Select —</option>
                        <option value="EBK">EBK (Engineers Board)</option>
                        <option value="BORAQS">BORAQS (Quantity Surveyors)</option>
                        <option value="ISK">ISK (Surveyors)</option>
                        <option value="BAK">BAK (Architects)</option>
                        <option value="NCA">NCA (Construction Authority)</option>
                        <option value="NEMA">NEMA (Environment)</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Registration number</label>
                      <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)} style={inputStyle} placeholder="e.g. A4782" />
                    </div>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Brief introduction (optional)</label>
                    <textarea rows={2} value={bio} onChange={e => setBio(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }}
                      placeholder="e.g. 8 years experience in road construction supervision..." />
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setStep(2)} style={{ flex: 1, padding: 12 }}>← Back</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}
                      style={{ flex: 2, padding: 12, fontSize: 14 }}>
                      {loading ? '⏳ Creating account...' : '✅ Create account'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
            {isLogin ? "Don't have an account? " : 'Already registered? '}
            <span onClick={() => { setIsLogin(!isLogin); setError(''); setStep(1); }}
              style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
              {isLogin ? 'Register' : 'Sign in'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
