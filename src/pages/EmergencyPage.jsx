import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const EMERGENCY_TYPES = [
  'Accident/Injury','Equipment Failure','Structural Collapse','Fire',
  'Medical Emergency','Environmental Spill','Security Threat','Flooding','Landslide','Other'
];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function EmergencyPage({ profile, showToast }) {
  const [emergencies, setEmergencies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tab, setTab] = useState('active');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [form, setForm] = useState({
    project_id: '', emergency_type: 'Accident/Injury', severity: 'Critical',
    chainage: '', people_involved: 0, description: ''
  });
  const [saving, setSaving] = useState(false);

  const canManage = hasRole(profile?.role, 're');

  useEffect(() => { loadAll(); }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    const [emRes, projRes] = await Promise.all([
      supabase.from('site_emergencies')
        .select('*, projects(name), reporter:reported_by(full_name), acknowledger:acknowledged_by(full_name), responder:response_by(full_name), resolver:resolved_by(full_name)')
        .order('reported_at', { ascending: false }),
      supabase.from('projects').select('id, name').order('name'),
    ]);
    setEmergencies(emRes.data || []);
    setProjects(projRes.data || []);
  }

  async function reportEmergency(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('site_emergencies').insert({
      ...form,
      people_involved: parseInt(form.people_involved) || 0,
      reported_by: profile.id,
    });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('🚨 Emergency reported!');
    setShowReportModal(false);
    setForm({ project_id: '', emergency_type: 'Accident/Injury', severity: 'Critical', chainage: '', people_involved: 0, description: '' });
    loadAll();
  }

  async function updateStatus(id, newStatus) {
    const updates = { status: newStatus };
    if (newStatus === 'Acknowledged') {
      updates.acknowledged_by = profile.id;
      updates.acknowledged_at = new Date().toISOString();
    } else if (newStatus === 'Response Underway') {
      updates.response_by = profile.id;
      updates.response_at = new Date().toISOString();
    } else if (newStatus === 'Resolved') {
      updates.resolved_by = profile.id;
      updates.resolved_at = new Date().toISOString();
      updates.resolution_notes = resolutionNotes;
    }
    await supabase.from('site_emergencies').update(updates).eq('id', id);
    showToast(`Emergency ${newStatus.toLowerCase()}`);
    setShowResolveModal(null);
    setResolutionNotes('');
    loadAll();
  }

  const active = emergencies.filter(e => e.status !== 'Resolved');
  const resolved = emergencies.filter(e => e.status === 'Resolved');
  const displayed = tab === 'active' ? active : resolved;

  const statusStyle = (s) => {
    if (s === 'Reported') return { background: '#dc2626', color: '#fff' };
    if (s === 'Acknowledged') return { background: '#d97706', color: '#fff' };
    if (s === 'Response Underway') return { background: '#2563eb', color: '#fff' };
    return { background: '#16a34a', color: '#fff' };
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🚨 Site Emergencies</h2>
          <div className="subtitle">
            {active.length > 0 ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{active.length} active emergency{active.length > 1 ? 'ies' : ''}</span>
            ) : (
              'No active emergencies'
            )}
          </div>
        </div>
        <button className="btn emergency-report-btn" onClick={() => setShowReportModal(true)}
          style={{ background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 15, padding: '12px 24px' }}>
          🚨 Report Emergency
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          Active ({active.length})
        </button>
        <button className={tab === 'resolved' ? 'active' : ''} onClick={() => setTab('resolved')}>
          Resolved ({resolved.length})
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="card empty-state">
          <div className="icon">{tab === 'active' ? '✓' : '📋'}</div>
          <p>{tab === 'active' ? 'No active emergencies' : 'No resolved emergencies'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {displayed.map(em => (
            <div key={em.id} className={`card ${em.status === 'Reported' ? 'emergency-card-blink' : ''}`}
              style={{
                borderLeft: `4px solid ${em.status === 'Reported' ? '#dc2626' : em.status === 'Acknowledged' ? '#d97706' : em.status === 'Response Underway' ? '#2563eb' : '#16a34a'}`,
                padding: 20
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 22 }}>
                      {em.emergency_type === 'Accident/Injury' ? '🤕' : em.emergency_type === 'Fire' ? '🔥' :
                       em.emergency_type === 'Medical Emergency' ? '🏥' : em.emergency_type === 'Equipment Failure' ? '⚙️' :
                       em.emergency_type === 'Structural Collapse' ? '🏗️' : em.emergency_type === 'Environmental Spill' ? '☣️' :
                       em.emergency_type === 'Flooding' ? '🌊' : em.emergency_type === 'Landslide' ? '⛰️' :
                       em.emergency_type === 'Security Threat' ? '🔒' : '⚠️'}
                    </span>
                    <h3 style={{ margin: 0 }}>{em.emergency_type}</h3>
                    <span className="badge" style={statusStyle(em.status)}>{em.status}</span>
                    <span className="badge" style={{ background: em.severity === 'Critical' ? '#7f1d1d' : '#78350f', color: '#fff' }}>
                      {em.severity}
                    </span>
                  </div>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{em.projects?.name}</div>
                </div>
                <div className="text-mono text-sm" style={{ textAlign: 'right' }}>
                  <div style={{ color: em.status === 'Reported' ? '#dc2626' : 'var(--text-muted)', fontWeight: 600 }}>
                    {timeAgo(em.reported_at)}
                  </div>
                </div>
              </div>

              <p style={{ margin: '8px 0', fontSize: 14 }}>{em.description}</p>

              <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {em.chainage && <span>📍 Ch. {em.chainage}</span>}
                {em.people_involved > 0 && <span>👥 {em.people_involved} people involved</span>}
                <span>Reported by: {em.reporter?.full_name}</span>
              </div>

              {/* Status timeline */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap', marginBottom: 12 }}>
                <span>📝 Reported {em.reported_at?.split('T')[0]} {em.reported_at?.split('T')[1]?.substring(0,5)}</span>
                {em.acknowledged_at && <span>✅ Acknowledged by {em.acknowledger?.full_name} — {timeAgo(em.acknowledged_at)}</span>}
                {em.response_at && <span>🚑 Response by {em.responder?.full_name} — {timeAgo(em.response_at)}</span>}
                {em.resolved_at && <span>✓ Resolved by {em.resolver?.full_name} — {timeAgo(em.resolved_at)}</span>}
              </div>

              {em.resolution_notes && (
                <div style={{ background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 }}>
                  <strong>Resolution:</strong> {em.resolution_notes}
                </div>
              )}

              {/* Action buttons */}
              {em.status !== 'Resolved' && canManage && (
                <div className="btn-group">
                  {em.status === 'Reported' && (
                    <button className="btn btn-sm" style={{ background: '#d97706', color: '#fff' }}
                      onClick={() => updateStatus(em.id, 'Acknowledged')}>
                      ✅ Acknowledge
                    </button>
                  )}
                  {(em.status === 'Reported' || em.status === 'Acknowledged') && (
                    <button className="btn btn-sm btn-primary" onClick={() => updateStatus(em.id, 'Response Underway')}>
                      🚑 Response Underway
                    </button>
                  )}
                  <button className="btn btn-sm btn-success" onClick={() => setShowResolveModal(em.id)}>
                    ✓ Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report Emergency Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ color: '#dc2626' }}>🚨 Report Site Emergency<button onClick={() => setShowReportModal(false)}>×</button></h3>
            <form onSubmit={reportEmergency}>
              <div className="form-group mb-16">
                <label>Project *</label>
                <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} required>
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Emergency Type *</label>
                  <select value={form.emergency_type} onChange={e => setForm({ ...form, emergency_type: e.target.value })}>
                    {EMERGENCY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>Severity *</label>
                  <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    <option value="Critical">🔴 Critical</option>
                    <option value="High">🟠 High</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Chainage / Location</label>
                  <input value={form.chainage} onChange={e => setForm({ ...form, chainage: e.target.value })}
                    placeholder="e.g. 5+200" />
                </div>
                <div className="form-group mb-16">
                  <label>People Involved</label>
                  <input type="number" min="0" value={form.people_involved}
                    onChange={e => setForm({ ...form, people_involved: e.target.value })} />
                </div>
              </div>
              <div className="form-group mb-16">
                <label>Description *</label>
                <textarea rows={3} value={form.description} required
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the emergency — what happened, where exactly, immediate actions taken..." />
              </div>
              <div className="btn-group">
                <button className="btn" type="submit" disabled={saving}
                  style={{ background: '#dc2626', color: '#fff', fontWeight: 700 }}>
                  {saving ? 'Reporting...' : '🚨 Report Emergency'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowReportModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="modal-overlay" onClick={() => setShowResolveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3>Resolve Emergency<button onClick={() => setShowResolveModal(null)}>×</button></h3>
            <div className="form-group mb-16">
              <label>Resolution Notes *</label>
              <textarea rows={4} value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                placeholder="Describe how the emergency was resolved, actions taken, any follow-up needed..." required />
            </div>
            <div className="btn-group">
              <button className="btn btn-success" onClick={() => updateStatus(showResolveModal, 'Resolved')}
                disabled={!resolutionNotes.trim()}>
                ✓ Mark Resolved
              </button>
              <button className="btn btn-secondary" onClick={() => setShowResolveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
