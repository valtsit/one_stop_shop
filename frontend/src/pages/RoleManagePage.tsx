import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchRoles, deleteRole, type Role } from '../services/api';
import './RoleManagePage.css';

const BUILTIN_ROLES = new Set(['role_super_admin', 'role_admin', 'role_user']);

const PERMISSION_LABELS: Record<string, string> = {
  '*': '所有权限',
  'department:create': '创建部门',
  'department:read': '查看部门',
  'department:update': '编辑部门',
  'department:delete': '删除部门',
  'user:manage': '用户管理',
  'agent:manage': '智能体管理',
};

export default function RoleManagePage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRoles()
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除角色"${name}"吗？`)) return;
    setDeleting(id);
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="content-area">
      <div className="role-manage-page">
        <div className="role-header">
          <div>
            <h1 className="role-title">角色管理</h1>
            <p className="role-subtitle">管理系统角色和权限配置</p>
          </div>
          <button
            className="role-create-btn"
            onClick={() => navigate('/roles/create')}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建角色
          </button>
        </div>

        {loading ? (
          <div className="role-empty">加载中...</div>
        ) : roles.length === 0 ? (
          <div className="role-empty">
            <p>还没有角色</p>
            <button
              className="role-create-btn"
              onClick={() => navigate('/roles/create')}
              type="button"
            >
              创建第一个角色
            </button>
          </div>
        ) : (
          <div className="role-grid">
            {roles.map((role) => {
              const isBuiltin = BUILTIN_ROLES.has(role.id);
              return (
                <div key={role.id} className="role-card">
                  <div className="role-card-header">
                    <div className="role-card-info">
                      <span className="role-card-icon">
                        {role.id === 'role_super_admin' ? '' : role.id === 'role_admin' ? '' : ''}
                      </span>
                      <div>
                        <div className="role-card-name">
                          {role.name}
                          {isBuiltin && <span className="role-builtin-badge">内置</span>}
                        </div>
                        {role.description && (
                          <div className="role-card-desc">{role.description}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="role-card-perms">
                    {role.permissions.map((p) => (
                      <span key={p} className="role-perm-tag">
                        {PERMISSION_LABELS[p] || p}
                      </span>
                    ))}
                  </div>
                  {!isBuiltin && (
                    <div className="role-card-actions">
                      <Link
                        to={`/roles/edit/${role.id}`}
                        className="role-action-btn"
                        title="编辑"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        编辑
                      </Link>
                      <button
                        className="role-action-btn role-action-delete"
                        onClick={() => handleDelete(role.id, role.name)}
                        title="删除"
                        type="button"
                        disabled={deleting === role.id}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        删除
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
