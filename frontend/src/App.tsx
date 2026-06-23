import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth, useHasPermission } from './contexts/AuthContext';
import { ToastProvider } from './hooks/useToast';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import AgentManagePage from './pages/AgentManagePage';
import AgentFormPage from './pages/AgentFormPage';
import LoginPage from './pages/LoginPage';
import DepartmentManagePage from './pages/DepartmentManagePage';
import DepartmentFormPage from './pages/DepartmentFormPage';
import UserManagePage from './pages/UserManagePage';
import UserFormPage from './pages/UserFormPage';
import RoleManagePage from './pages/RoleManagePage';
import RoleFormPage from './pages/RoleFormPage';
import ProfilePage from './pages/ProfilePage';
import AdminConversationsPage from './pages/AdminConversationsPage';
import SkillManagePage from './pages/SkillManagePage';
import SkillFormPage from './pages/SkillFormPage';
import KnowledgeManagePage from './pages/KnowledgeManagePage';
import KnowledgeFormPage from './pages/KnowledgeFormPage';
import KnowledgeReviewPage from './pages/KnowledgeReviewPage';
import RecycleBinPage from './pages/RecycleBinPage';
import WikiManagePage from './pages/WikiManagePage';
import WikiSpacePage from './pages/WikiSpacePage';
import WikiPageView from './pages/WikiPageView';
import WikiPageEditPage from './pages/WikiPageEditPage';
import WikiLayout from './pages/WikiLayout';
import './styles/global.css';

function ProtectedRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const hasPerm = useHasPermission();
  if (!hasPerm(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  const { token, user, logout, loading } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--canvas)',
        color: 'var(--ink-muted)',
        fontSize: 14,
        gap: 12,
        flexDirection: 'column',
      }}>
        <div className="app-loading-spinner" />
        <span>加载中...</span>
      </div>
    );
  }

  if (!token) {
    return (
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="app-layout">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          user={user}
        />
        <div className="app-main">
          <header className="topbar">
            <div className="topbar-brand">
              <button
                className="topbar-menu-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                type="button"
                aria-label="打开侧边栏"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                </svg>
              </button>
              <span className="brand-icon">✦</span>
              <span className="brand-text">AI 电商工具</span>
            </div>
            <div className="topbar-actions">
              <Link to="/" className="theme-toggle-btn" title="回到主页">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </Link>
              <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                type="button"
                title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
              >
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
              <Link to="/profile" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>{user?.display_name || user?.username}</Link>
              <button className="topbar-btn topbar-btn-primary" type="button" onClick={logout}>
                退出
              </button>
            </div>
          </header>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat/:toolId" element={<ChatPage />} />
            <Route path="/profile" element={<ProfilePage />} />

            <Route path="/agents" element={<ProtectedRoute permission="agent:read"><AgentManagePage /></ProtectedRoute>} />
            <Route path="/agents/create" element={<ProtectedRoute permission="agent:create"><AgentFormPage /></ProtectedRoute>} />
            <Route path="/agents/edit/:agentId" element={<ProtectedRoute permission="agent:update"><AgentFormPage /></ProtectedRoute>} />

            <Route path="/skills" element={<ProtectedRoute permission="skill:read"><SkillManagePage /></ProtectedRoute>} />
            <Route path="/skills/create" element={<ProtectedRoute permission="skill:create"><SkillFormPage /></ProtectedRoute>} />
            <Route path="/skills/edit/:skillId" element={<ProtectedRoute permission="skill:update"><SkillFormPage /></ProtectedRoute>} />

            <Route path="/knowledge" element={<ProtectedRoute permission="knowledge:read"><KnowledgeManagePage /></ProtectedRoute>} />
            <Route path="/knowledge/create" element={<ProtectedRoute permission="knowledge:create"><KnowledgeFormPage /></ProtectedRoute>} />
            <Route path="/knowledge/edit/:id" element={<ProtectedRoute permission="knowledge:read"><KnowledgeFormPage /></ProtectedRoute>} />
            <Route path="/knowledge/review" element={<ProtectedRoute permission="knowledge:review"><KnowledgeReviewPage /></ProtectedRoute>} />

            <Route path="/wiki" element={<ProtectedRoute permission="wiki:read"><WikiLayout /></ProtectedRoute>}>
              <Route index element={<WikiManagePage />} />
              <Route path=":spaceId" element={<WikiSpacePage />} />
              <Route path=":spaceId/page/:pageId" element={<WikiPageView />} />
              <Route path=":spaceId/create" element={<ProtectedRoute permission="wiki:create"><WikiPageEditPage /></ProtectedRoute>} />
              <Route path=":spaceId/edit/:pageId" element={<ProtectedRoute permission="wiki:update"><WikiPageEditPage /></ProtectedRoute>} />
            </Route>

            <Route path="/departments" element={<ProtectedRoute permission="department:read"><DepartmentManagePage /></ProtectedRoute>} />
            <Route path="/departments/create" element={<ProtectedRoute permission="department:create"><DepartmentFormPage /></ProtectedRoute>} />
            <Route path="/departments/edit/:deptId" element={<ProtectedRoute permission="department:update"><DepartmentFormPage /></ProtectedRoute>} />

            <Route path="/users" element={<ProtectedRoute permission="user:read"><UserManagePage /></ProtectedRoute>} />
            <Route path="/users/create" element={<ProtectedRoute permission="user:create"><UserFormPage /></ProtectedRoute>} />
            <Route path="/users/edit/:userId" element={<ProtectedRoute permission="user:update"><UserFormPage /></ProtectedRoute>} />

            <Route path="/roles" element={<ProtectedRoute permission="role:read"><RoleManagePage /></ProtectedRoute>} />
            <Route path="/roles/create" element={<ProtectedRoute permission="role:create"><RoleFormPage /></ProtectedRoute>} />
            <Route path="/roles/edit/:roleId" element={<ProtectedRoute permission="role:update"><RoleFormPage /></ProtectedRoute>} />

            <Route path="/admin/conversations" element={<ProtectedRoute permission="conversation:read"><AdminConversationsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute permission="settings:read"><SettingsPage /></ProtectedRoute>} />
            <Route path="/recycle-bin" element={<ProtectedRoute permission="agent:read"><RecycleBinPage /></ProtectedRoute>} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
