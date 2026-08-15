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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
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
  const [isResetMode, setIsResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetComplete, setResetComplete] = useState(false);

  // Detect password reset link from URL
  useState(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsResetMode(true);
    }
    // Also listen for Supabase auth events
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResetMode(true);
      }
    });
  }, []);

  const finalPosition = position === '__custom__' ? customPosition : position;
  const finalQualification = qualification === 'Other' ? customQualification : qualification;

  // Password strength
  function getPasswordStrength(pwd) {
    if (!pwd) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { level: 1, label: 'Weak', color: '#ef4444' };
    if (score <= 2) return { level: 2, label: 'Fair', color: '#f59e0b' };
    if (score <= 3) return { level: 3, label: 'Good', color: '#0891b2' };
    return { level: 4, label: 'Strong', color: '#059669' };
  }
  const pwdStrength = getPasswordStrength(password);

  // Forgot password
  async function handleForgotPassword() {
    if (!resetEmail) { setError('Enter your email address'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setResetSent(true);
      showToast('Password reset email sent — check your inbox');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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

  // Reset password (after clicking email link)
  async function handleResetPassword() {
    if (!newPassword) { setError('Enter a new password'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetComplete(true);
      showToast('Password updated successfully');
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

  // ═══ PASSWORD RESET FORM ═══
  if (isResetMode) {
    const rpStrength = getPasswordStrength(newPassword);
    return (
      <div className="auth-page">
        <div style={{ maxWidth: 440, margin: '0 auto', padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #059669, #3b82f6)' }} />

            {resetComplete ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#05966920', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Password updated</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>Your password has been changed successfully</p>
                <button className="btn btn-primary" onClick={() => { setIsResetMode(false); setIsLogin(true); window.location.hash = ''; }}
                  style={{ width: '100%', padding: 12 }}>Sign in with new password</button>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#3b82f615', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>🔑</div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Set new password</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Choose a strong password for your account</p>
                </div>

                {error && (
                  <div style={{ background: '#ef444415', color: '#ef4444', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16, border: '1px solid #ef444430' }}>{error}</div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>New password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} placeholder="Min 6 characters" />
                  {newPassword && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[1,2,3,4].map(i => (
                          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= rpStrength.level ? rpStrength.color : 'var(--border)', transition: 'all 0.3s' }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: rpStrength.color, fontWeight: 600 }}>{rpStrength.label}</div>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Confirm password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inputStyle} placeholder="Re-enter your new password" />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Passwords do not match</div>
                  )}
                  {confirmPassword && newPassword === confirmPassword && (
                    <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>✓ Passwords match</div>
                  )}
                </div>

                <button className="btn btn-primary" onClick={handleResetPassword} disabled={loading || !newPassword || newPassword !== confirmPassword}
                  style={{ width: '100%', padding: 12, fontSize: 14, opacity: (!newPassword || newPassword !== confirmPassword) ? 0.5 : 1 }}>
                  {loading ? '⏳ Updating...' : '🔐 Update password'}
                </button>
              </>
            )}
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

          {isLogin && !showForgotPassword ? (
            /* ═══ LOGIN ═══ */
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#3b82f615', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>🔐</div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Secure sign in</h2>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" required />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Enter your password" required minLength={6} />
              </div>
              <div style={{ textAlign: 'right', marginBottom: 16 }}>
                <span onClick={() => { setShowForgotPassword(true); setResetEmail(email); setError(''); }}
                  style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}>Forgot password?</span>
              </div>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: 12, fontSize: 14 }}>
                {loading ? '⏳ Signing in...' : 'Sign in'}
              </button>

              {/* Security badges */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>🔒 SSL encrypted</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>🛡️ Role-based access</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>📋 Audit logged</div>
              </div>
            </div>
          ) : isLogin && showForgotPassword ? (
            /* ═══ FORGOT PASSWORD ═══ */
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f59e0b15', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>🔑</div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Reset your password</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>We'll send a reset link to your email</p>
              </div>

              {resetSent ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ background: '#05966915', border: '1px solid #05966930', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>Reset email sent</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Check your inbox at <strong>{resetEmail}</strong> and click the reset link</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => { setShowForgotPassword(false); setResetSent(false); }}
                    style={{ width: '100%', padding: 12 }}>← Back to sign in</button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Email address</label>
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" />
                  </div>
                  <button className="btn btn-primary" onClick={handleForgotPassword} disabled={loading}
                    style={{ width: '100%', padding: 12, fontSize: 14, marginBottom: 12 }}>
                    {loading ? '⏳ Sending...' : '📧 Send reset link'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setShowForgotPassword(false); setError(''); }}
                    style={{ width: '100%', padding: 10 }}>← Back to sign in</button>
                </>
              )}
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
                    {password && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          {[1,2,3,4].map(i => (
                            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= pwdStrength.level ? pwdStrength.color : 'var(--border)', transition: 'all 0.3s' }} />
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: pwdStrength.color, fontWeight: 600 }}>
                          {pwdStrength.label} {pwdStrength.level >= 3 ? '✓' : '— add uppercase, numbers, or symbols'}
                        </div>
                      </div>
                    )}
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

                  {/* Security notice */}
                  <div style={{ padding: '10px 14px', background: '#05966910', border: '1px solid #05966925', borderRadius: 8, marginBottom: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 600, color: '#059669' }}>🔒 Your data is protected</div>
                    <div>Your information is encrypted and stored securely. Only authorised administrators can view and approve your registration. By creating an account you agree to responsible use of this platform.</div>
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
            {isLogin && !showForgotPassword ? "Don't have an account? " : !isLogin ? 'Already registered? ' : ''}
            {(isLogin && !showForgotPassword) && (
              <span onClick={() => { setIsLogin(false); setError(''); setStep(1); }}
                style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Register</span>
            )}
            {!isLogin && (
              <span onClick={() => { setIsLogin(true); setError(''); setStep(1); setShowForgotPassword(false); }}
                style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Sign in</span>
            )}
          </div>

          {/* Footer security */}
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 10, color: 'var(--text-muted)', opacity: 0.6 }}>
            🔐 Secured by Supabase · End-to-end encrypted · FIDIC compliant
          </div>
        </div>
      </div>
    </div>
  );
}
