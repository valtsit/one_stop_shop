import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchAgents, fetchPendingReviewCount, type Agent } from '../services/api';

interface SidebarUser {
  role_id: string;
  permissions?: string[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: SidebarUser | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: '通用',
  management: '管理工具',
  ecommerce: '电商工具',
  design: '设计工具',
  xiaohongshu: '小红书工具',
  business_coach: '商业教练',
  caishui: '财税工具',
};

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function Sidebar({ collapsed, onToggle, user }: SidebarProps) {
  const perms = user?.permissions || [];
  const hasPerm = (p: string) => perms.includes('*') || perms.includes(p);
  const isAdmin = hasPerm('user:read');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!hasPerm('knowledge:review')) return;
    let cancelled = false;
    const load = () => {
      fetchPendingReviewCount().then((c) => { if (!cancelled) setPendingReviewCount(c); }).catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [hasPerm('knowledge:review')]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        if (collapsed) onToggle();
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [searchOpen, collapsed, onToggle]);

  const filteredAgents = searchQuery.trim()
    ? agents.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : agents;

  const grouped = filteredAgents.reduce<Record<string, Agent[]>>((acc, tool) => {
    (acc[tool.category] ||= []).push(tool);
    return acc;
  }, {});

  const sidebarClass = collapsed ? 'sidebar sidebar-collapsed' : 'sidebar mobile-open';
  const overlayClass = collapsed ? 'sidebar-overlay' : 'sidebar-overlay active';

  return (
    <>
      <div className={overlayClass} onClick={onToggle} />
      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <div className="sidebar-header-row">
            <Link to="/" className="sidebar-newchat" onClick={() => collapsed && onToggle()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>新对话</span>
            </Link>
            <button className="sidebar-collapse-btn" onClick={onToggle} type="button" title="收起侧边栏">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        <div className="sidebar-search">
          {searchOpen ? (
            <div className="sidebar-search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                className="sidebar-search-input"
                placeholder="搜索智能体..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                className="sidebar-search-close"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <button className="sidebar-search-btn" type="button" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>搜索</span>
              <span className="sidebar-search-kbd">⌘K</span>
            </button>
          )}
        </div>

        <div className="sidebar-section">
          {/* 工具导航 */}
          <div
            className="sidebar-section-title"
            onClick={() => setToolsCollapsed(!toolsCollapsed)}
          >
            <span className="sidebar-section-title-text">工具导航</span>
            <span className={`sidebar-section-toggle ${toolsCollapsed ? 'collapsed' : ''}`}>
              <ChevronIcon />
            </span>
          </div>
          <div className={`sidebar-section-content ${toolsCollapsed ? 'collapsed' : ''}`}>
            {Object.entries(grouped).map(([cat, catAgents]) => {
              if (!catAgents?.length) return null;
              const label = CATEGORY_LABELS[cat] || cat;
              return (
                <div key={cat}>
                  <div className="sidebar-section-title" style={{ paddingLeft: 20, fontSize: 11 }}>
                    {label}
                  </div>
                  {catAgents.map((tool) => (
                    <Link
                      key={tool.id}
                      to={`/chat/${tool.id}`}
                      className={`sidebar-tool-item ${
                        location.pathname === `/chat/${tool.id}` ? 'active' : ''
                      }`}
                      onClick={() => collapsed && onToggle()}
                    >
                      <span className="tool-icon">{tool.icon}</span>
                      <span>{tool.name}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
            {searchQuery.trim() && Object.values(grouped).every((arr) => arr.length === 0) && (
              <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                未找到匹配智能体
              </div>
            )}
          </div>

          {/* 历史会话 */}
          <div
            className="sidebar-section-title"
            onClick={() => setHistoryCollapsed(!historyCollapsed)}
          >
            <span className="sidebar-section-title-text">历史会话</span>
            <span className={`sidebar-section-toggle ${historyCollapsed ? 'collapsed' : ''}`}>
              <ChevronIcon />
            </span>
          </div>
          <div className={`sidebar-section-content ${historyCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-history-date">今天</div>
            {agents.slice(0, 3).map((tool) => (
              <Link
                key={`hist-${tool.id}`}
                to={`/chat/${tool.id}`}
                className="sidebar-history-item"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{tool.name}</span>
              </Link>
            ))}

            <div className="sidebar-history-date">昨天</div>
            {agents.slice(3, 6).map((tool) => (
              <Link
                key={`hist2-${tool.id}`}
                to={`/chat/${tool.id}`}
                className="sidebar-history-item"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{tool.name}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <Link
            to="/agents"
            className="sidebar-footer-btn"
            onClick={() => collapsed && onToggle()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 9H5a2 2 0 0 0-2 2v1a7 7 0 0 0 14 0v-1a2 2 0 0 0-2-2z" />
              <path d="M12 19v4M8 23h8" />
            </svg>
            <span>智能体管理</span>
          </Link>
          {hasPerm('skill:read') && (
            <Link
              to="/skills"
              className="sidebar-footer-btn"
              onClick={() => collapsed && onToggle()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>Skill 管理</span>
            </Link>
          )}
          {hasPerm('knowledge:review') && (
            <Link
              to="/knowledge/review"
              className="sidebar-footer-btn"
              onClick={() => collapsed && onToggle()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>知识库审核</span>
              {pendingReviewCount > 0 && (
                <span className="review-badge">{pendingReviewCount > 99 ? '99+' : pendingReviewCount}</span>
              )}
            </Link>
          )}
          <Link
            to="/knowledge"
            className="sidebar-footer-btn"
            onClick={() => collapsed && onToggle()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>知识库</span>
          </Link>
          <Link
            to="/wiki"
            className="sidebar-footer-btn"
            onClick={() => collapsed && onToggle()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span>Wiki 知识库</span>
          </Link>
          {hasPerm('department:read') && (
              <Link
                to="/departments"
                className="sidebar-footer-btn"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21v-6h6v6" />
                  <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
                </svg>
                <span>部门管理</span>
              </Link>
          )}
          {isAdmin && (
              <Link
                to="/users"
                className="sidebar-footer-btn"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>用户管理</span>
              </Link>
          )}
          {isAdmin && (
              <Link
                to="/roles"
                className="sidebar-footer-btn"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>角色管理</span>
              </Link>
          )}
          {isAdmin && (
              <Link
                to="/recycle-bin"
                className="sidebar-footer-btn"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                <span>回收站</span>
              </Link>
          )}
          {isAdmin && (
              <Link
                to="/admin/conversations"
                className="sidebar-footer-btn"
                onClick={() => collapsed && onToggle()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>聊天记录管理</span>
              </Link>
          )}
          <Link
            to="/profile"
            className="sidebar-footer-btn"
            onClick={() => collapsed && onToggle()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>个人设置</span>
          </Link>
          {isAdmin && (
            <Link
              to="/settings"
              className="sidebar-footer-btn"
              onClick={() => collapsed && onToggle()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>模型设置</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
