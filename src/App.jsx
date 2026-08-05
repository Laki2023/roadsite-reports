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

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◫', minRole: 'inspector' },
  { section: 'Projects' },
  { key: 'projects', label: 'Projects', icon: '◈', minRole: 'inspector' },
  { section: 'Field Work' },
  { key: 'submit-report', label: 'Submit Report', icon: '✎', minRole: 'inspector' },
  { key: 'reports', label: 'View Reports', icon: '☰', minRole: 'inspector' },
  { key: 'issues', label: 'Site Issues', icon: '⚠', minRole: 'inspector' },
  { section: 'Road Engineering' },
  { key: 'pavement', label: 'Pavement Layers', icon: '▤', minRole: 're' },
  { key: 'quality', label: 'Quality Tests', icon: '⬡', minRole: 'inspector' },
  { section: 'Management' },
  { key: 'staff', label: 'Staff & Teams', icon: '◉', minRole: 'engineer' },
  { key: 'admin', label: 'Administration', icon: '⚙', minRole: 'admin' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

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
          You'll receive access once your role is assigned.
        </p>
        <button className="btn btn-secondary mt-24"
          onClick={() => supabase.auth.signOut()}>
          Sign Out
        </button>
      </div>
    </div>
  );

  const renderPage = () => {
    const ctx = { profile, showToast, navigateTo, selectedProject, setSelectedProject };
    switch (page) {
      case 'dashboard': return <Dashboard {...ctx} />;
      case 'projects': return <ProjectsPage {...ctx} />;
      case 'project-detail': return <ProjectDetail {...ctx} />;
      case 'submit-report': return <SubmitReport {...ctx} />;
      case 'reports': return <ReportsPage {...ctx} />;
      case 'pavement': return <PavementPage {...ctx} />;
      case 'quality': return <QualityTestsPage {...ctx} />;
      case 'issues': return <IssuesPage {...ctx} />;
      case 'staff': return <StaffPage {...ctx} />;
      case 'admin': return <AdminPanel {...ctx} />;
      default: return <Dashboard {...ctx} />;
    }
  };

  return (
    <div className="app-shell">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>RoadSite Reports</span>
      </div>

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>RoadSite Reports</h1>
          <div className="brand-sub">v2.0 — Field & Quality</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item, i) => {
            if (item.section) return <div key={i} className="nav-section">{item.section}</div>;
            if (!hasRole(profile.role, item.minRole)) return null;
            return (
              <button key={item.key}
                className={page === item.key ? 'active' : ''}
                onClick={() => navigateTo(item.key)}>
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="user-name">{profile.full_name}</div>
          <div className="user-role">{ROLE_LABELS[profile.role] || profile.role}</div>
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
