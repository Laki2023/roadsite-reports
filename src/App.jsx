import { useState, useEffect } from 'react';
import { supabase, getProfile, signOut } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import SubmitReport from './pages/SubmitReport';
import ReportsPage from './pages/ReportsPage';
import ProjectsPage from './pages/ProjectsPage';
import AdminPanel from './pages/AdminPanel';
import './index.css';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['re', 'engineer', 'admin'] },
  { key: 'submit', label: 'Submit Report', icon: '📝', roles: ['re', 'engineer', 'admin'] },
  { key: 'reports', label: 'All Reports', icon: '📋', roles: ['re', 'engineer', 'admin'] },
  { key: 'projects', label: 'Projects', icon: '🗺', roles: ['re', 'engineer', 'admin'] },
  { key: 'admin', label: 'Admin Panel', icon: '⚙️', roles: ['admin'] },
];

function PendingScreen({ profile, onSignOut }) {
  return (
    <div className="pending-screen">
      <div className="pending-card">
        <div className="big-icon">⏳</div>
        <h2>Account pending approval</h2>
        <p style={{ marginTop: 10 }}>
          Welcome, <strong>{profile?.full_name}</strong>. Your account has been registered and is
          awaiting role assignment by the site administrator. You will be able to log in and access
          the system once your account is approved.
        </p>
        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--gray-400)' }}>
          Contact your project administrator if you have been waiting more than 24 hours.
        </p>
        <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load urgent count for badge
  useEffect(() => {
    if (!profile || !['admin', 'engineer'].includes(profile.role)) return;
    supabase
      .from('daily_reports')
      .select('id', { count: 'exact' })
      .eq('is_urgent', true)
      .neq('status', 'actioned')
      .then(({ count }) => setUrgentCount(count || 0));
  }, [profile]);

  const loadProfile = async (userId) => {
    const { data } = await getProfile(userId);
    setProfile(data);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setProfile(null);
    setPage('dashboard');
  };

  const navigate = (p) => {
    setPage(p);
    setSidebarOpen(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--asphalt)' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🛣</div>
          <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>Loading RoadSite…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage onAuth={(u) => { setUser(u); loadProfile(u.id); }} />;

  if (profile?.role === 'pending') return <PendingScreen profile={profile} onSignOut={handleSignOut} />;

  const allowedNav = NAV.filter(n => n.roles.includes(profile?.role));

  const renderPage = () => {
    const props = { currentUser: user, profile, onNavigate: navigate };
    switch (page) {
      case 'dashboard': return <Dashboard {...props} />;
      case 'submit': return <SubmitReport {...props} />;
      case 'reports': return <ReportsPage {...props} />;
      case 'projects': return <ProjectsPage {...props} />;
      case 'admin': return profile?.role === 'admin' ? <AdminPanel {...props} /> : <Dashboard {...props} />;
      default: return <Dashboard {...props} />;
    }
  };

  return (
    <div className="app-shell">
      {/* Mobile menu button */}
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ fontSize: 24, marginBottom: 6 }}>🛣</div>
          <h2>RoadSite</h2>
          <p>Field Reporting System</p>
        </div>

        <nav className="sidebar-nav">
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--gray-500)', textTransform: 'uppercase', padding: '6px 12px', marginBottom: 4 }}>
            Navigation
          </p>
          {allowedNav.map(item => (
            <button
              key={item.key}
              className={`nav-item${page === item.key ? ' active' : ''}`}
              onClick={() => navigate(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'dashboard' && urgentCount > 0 && (
                <span className="nav-badge">{urgentCount}</span>
              )}
            </button>
          ))}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '14px 0' }} />

          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--gray-500)', textTransform: 'uppercase', padding: '0 12px', marginBottom: 8 }}>
            Role
          </p>
          <div style={{ padding: '0 12px' }}>
            <span className={`badge ${profile?.role === 'admin' ? 'badge-admin' : profile?.role === 'engineer' ? 'badge-engineer' : 'badge-re'}`}>
              {profile?.role === 're' ? 'Resident Engineer' : profile?.role === 'engineer' ? 'Engineer' : 'Administrator'}
            </span>
          </div>
        </nav>

        <div className="sidebar-user">
          <div className="su-name">{profile?.full_name || user.email}</div>
          <div className="su-role">{profile?.email}</div>
          <button className="su-signout" onClick={handleSignOut}>
            <span>⬡</span> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
