import React, { useState, useEffect, useCallback } from 'react';
import { supabase, hasRole, ROLE_LABELS } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetail from './pages/ProjectDetail';
import SubmitReport from './pages/SubmitReport';
import ReportsPage from './pages/ReportsPage';
import PavementPage from './pages/PavementPage';
import QualityTestsPage from './pages/QualityTestsPage';
import IssuesPage from './pages/IssuesPage';
import StaffPage from './pages/StaffPage';
import AdminPanel from './pages/AdminPanel';
import EmergencyPage from './pages/EmergencyPage';
import WorksActivitiesPage from './pages/WorksActivitiesPage';
import EquipmentPage from './pages/EquipmentPage';
import StructuresPage from './pages/StructuresPage';
import BoQPage from './pages/BoQPage';
import IPCPage from './pages/IPCPage';
import UserManagement from './pages/UserManagement';
import ApprovalsPage from './pages/ApprovalsPage';
import ProjectDashboard from './pages/ProjectDashboard';
import OrgManagement from './pages/OrgManagement';
import ProjectSummary from './pages/ProjectSummary';
import MonthlyReportPage from './pages/MonthlyReportPage';
import ProgrammePage from './pages/ProgrammePage';
import ClaimsPage from './pages/ClaimsPage';
import KeyPersonnelPage from './pages/KeyPersonnelPage';
import ApprovalsMatrixPage from './pages/ApprovalsMatrixPage';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', minRole: 'viewer' },
  { section: 'Projects' },
  { key: 'projects', label: 'All Projects', icon: '📁', minRole: 'viewer' },
  { section: 'Field Operations' },
  { key: 'submit-report', label: 'Submit Report', icon: '📝', minRole: 'inspector' },
  { key: 'reports', label: 'Daily Reports', icon: '📄', minRole: 'viewer' },
  { key: 'works', label: 'Works Activities', icon: '⛏️', minRole: 'inspector' },
  { key: 'issues', label: 'Site Issues', icon: '⚠️', minRole: 'inspector' },
  { key: 'emergency', label: 'Emergency', icon: '🚨', minRole: 'inspector' },
  { section: 'Engineering' },
  { key: 'pavement', label: 'Pavement Layers', icon: '🛣️', minRole: 'resident_engineer' },
  { key: 'quality', label: 'Quality Tests', icon: '🧪', minRole: 'inspector' },
  { key: 'equipment', label: 'Equipment', icon: '🚜', minRole: 'inspector' },
  { key: 'structures', label: 'Structures', icon: '🌉', minRole: 'inspector' },
  { key: 'programme', label: 'Programme of Works', icon: '📅', minRole: 'resident_engineer' },
  { section: 'Contract Admin' },
  { key: 'boq', label: 'Bill of Quantities', icon: '📋', minRole: 'inspector' },
  { key: 'ipc', label: 'Payment Certificates', icon: '💰', minRole: 'project_engineer' },
  { key: 'approvals', label: 'Approvals & Instructions', icon: '✅', minRole: 'resident_engineer' },
  { key: 'monthly-report', label: 'Monthly Report', icon: '📋', minRole: 'resident_engineer' },
  { key: 'claims', label: 'Claims Management', icon: '⚖️', minRole: 'resident_engineer' },
  { key: 'key-personnel', label: 'Key Personnel', icon: '👥', minRole: 'inspector' },
  { key: 'approvals-matrix', label: 'Approvals Matrix', icon: '🔐', minRole: 'resident_engineer' },
  { section: 'Administration' },
  { key: 'staff', label: 'Staff & Teams', icon: '👥', minRole: 'project_engineer' },
  { key: 'user-mgmt', label: 'User Management', icon: '🛡️', minRole: 'engineer' },
  { key: 'org-mgmt', label: 'Organisations', icon: '🏛️', minRole: 'director_general' },
  { key: 'admin', label: 'System Settings', icon: '⚙️', minRole: 'super_admin' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeEmergencies, setActiveEmergencies] = useState([]);
  const [pendingCounts, setPendingCounts] = useState({ issues: 0, approvals: 0 });

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) fetchProfile(s.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) fetchProfile(s.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Poll for active emergencies every 20 seconds
  useEffect(() => {
    if (!session) return;
    loadEmergencies();
    const interval = setInterval(loadEmergencies, 20000);
    return () => clearInterval(interval);
  }, [session]);

  async function loadEmergencies() {
    const [emRes, issRes, aqRes] = await Promise.all([
      supabase.from('site_emergencies')
        .select('*, projects(name), reporter:reported_by(full_name)')
        .neq('status', 'Resolved')
        .order('reported_at', { ascending: false }),
      supabase.from('site_issues')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Open', 'In Progress']),
      supabase.from('approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);
    setActiveEmergencies(emRes.data || []);
    setPendingCounts({
      issues: issRes.count || 0,
      approvals: aqRes.count || 0,
    });
  }

  async function fetchProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
    setProfile(data);
    setLoading(false);
  }

  function navigateTo(pg, project = null) {
    setPage(pg);
    if (project !== undefined) setSelectedProject(project);
    setSidebarOpen(false);
  }

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

  if (loading) return (
    <div className="auth-page">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--accent)' }}>◈</div>
        Loading...
      </div>
    </div>
  );

  if (!session) return <AuthPage onAuth={() => {}} showToast={showToast} />;
  if (!profile) return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>Setting up your profile...</h2>
        <p className="text-muted mt-16">Please wait or refresh the page.</p>
      </div>
    </div>
  );
  if (profile.role === 'pending') return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h2>Awaiting Approval</h2>
        <p className="text-muted mt-16">
          Your account is pending approval by an administrator.
        </p>
        <button className="btn btn-secondary mt-24" onClick={() => supabase.auth.signOut()}>Sign Out</button>
      </div>
    </div>
  );

  const unreported = activeEmergencies.filter(e => e.status === 'Reported');

  const renderPage = () => {
    const ctx = { profile, showToast, navigateTo, selectedProject, setSelectedProject };
    switch (page) {
      case 'dashboard': return <Dashboard {...ctx} activeEmergencies={activeEmergencies} />;
      case 'projects': return <ProjectsPage {...ctx} />;
      case 'project-detail': return <ProjectDashboard {...ctx} projectId={selectedProject?.id} onBack={() => navigateTo('projects')} />;
      case 'submit-report': return <SubmitReport {...ctx} />;
      case 'reports': return <ReportsPage {...ctx} />;
      case 'pavement': return <PavementPage {...ctx} />;
      case 'quality': return <QualityTestsPage {...ctx} />;
      case 'issues': return <IssuesPage {...ctx} />;
      case 'works': return <WorksActivitiesPage {...ctx} />;
      case 'equipment': return <EquipmentPage {...ctx} />;
      case 'structures': return <StructuresPage {...ctx} />;
      case 'boq': return <BoQPage {...ctx} />;
      case 'ipc': return <IPCPage {...ctx} />;
      case 'staff': return <StaffPage {...ctx} />;
      case 'user-mgmt': return <UserManagement {...ctx} />;
      case 'approvals': return <ApprovalsPage {...ctx} />;
      case 'monthly-report': return <MonthlyReportPage {...ctx} />;
      case 'programme': return <ProgrammePage {...ctx} />;
      case 'claims': return <ClaimsPage {...ctx} />;
      case 'key-personnel': return <KeyPersonnelPage {...ctx} />;
      case 'approvals-matrix': return <ApprovalsMatrixPage {...ctx} />;
      case 'org-mgmt': return <OrgManagement {...ctx} />;
      case 'admin': return <AdminPanel {...ctx} />;
      case 'emergency': return <EmergencyPage {...ctx} />;
      case 'project-dashboard': return <ProjectDashboard {...ctx} projectId={selectedProject?.id} onBack={() => navigateTo('dashboard')} />;
      case 'project-summary': return <ProjectSummary {...ctx} />;
      default: return <Dashboard {...ctx} activeEmergencies={activeEmergencies} />;
    }
  };

  return (
    <div className="app-shell">
      {/* ── EMERGENCY BANNER ── */}
      {unreported.length > 0 && (
        <div className="emergency-banner" onClick={() => navigateTo('emergency')}>
          <span className="emergency-banner-icon">🚨</span>
          <span className="emergency-banner-text">
            <strong>EMERGENCY</strong> — {unreported[0].emergency_type} at {unreported[0].projects?.name}
            {unreported[0].chainage ? `, Ch. ${unreported[0].chainage}` : ''}
            {' — '}{timeAgo(unreported[0].reported_at)}
            {unreported.length > 1 && ` (+${unreported.length - 1} more)`}
          </span>
          <span className="emergency-banner-action">View & Respond →</span>
        </div>
      )}

      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>RoadSite Reports</span>
      </div>

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>RoadSite Reports</h1>
          <div className="brand-sub">v14.9 — Road Project Management</div>
        </div>

        {/* Project Context Banner */}
        {selectedProject && page !== 'dashboard' && page !== 'projects' && (
          <div style={{ padding: '8px 12px', margin: '0 12px 8px', background: 'rgba(232,123,53,0.15)',
            borderRadius: 'var(--radius)', borderLeft: '3px solid #e87b35', cursor: 'pointer' }}
            onClick={() => navigateTo('project-dashboard', selectedProject)}>
            <div style={{ fontSize: 10, color: '#e87b35', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Project</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedProject.name || 'Selected Project'}
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item, i) => {
            if (item.section) return <div key={i} className="nav-section">{item.section}</div>;
            if (!profile.is_platform_admin && !hasRole(profile.role, item.minRole)) return null;
            const isActive = page === item.key;
            const badge = item.key === 'emergency' && activeEmergencies.length > 0 ? activeEmergencies.length
              : item.key === 'issues' && pendingCounts.issues > 0 ? pendingCounts.issues
              : item.key === 'approvals' && pendingCounts.approvals > 0 ? pendingCounts.approvals
              : null;
            return (
              <button key={item.key}
                className={isActive ? 'active' : ''}
                onClick={() => navigateTo(item.key)}
                style={{ position: 'relative' }}>
                <span style={{ fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: item.key === 'emergency' ? '#ef4444' : '#e87b35', color: '#fff',
                    fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 9999, minWidth: 16, textAlign: 'center' }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e87b35', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
              {profile.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name}</div>
              <div className="user-role">{profile.is_platform_admin ? '🔒 Platform Admin' : (ROLE_LABELS[profile.role] || profile.role)}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm mt-16" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => supabase.auth.signOut()}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {renderPage()}
      </main>

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
