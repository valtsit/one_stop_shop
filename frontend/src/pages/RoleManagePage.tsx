import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchRoles, deleteRole, type Role } from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './RoleManagePage.css';

const BUILTIN_ROLES = new Set(['role_super_admin', 'role_admin', 'role_user']);

const PERMISSION_LABELS: Record<string, string> = {
  '*': '所有权限',
  'department:create': '部门-新增',
  'department:read': '部门-查看',
  'department:update': '部门-编辑',
  'department:delete': '部门-删除',
  'agent:create': '智能体-新增',
  'agent:read': '智能体-查看',
  'agent:update': '智能体-编辑',
  'agent:delete': '智能体-删除',
  'skill:create': 'Skill-新增',
  'skill:read': 'Skill-查看',
  'skill:update': 'Skill-编辑',
  'skill:delete': 'Skill-删除',
  'knowledge:create': '知识库-新增',
  'knowledge:read': '知识库-查看',
  'knowledge:update': '知识库-编辑',
  'knowledge:delete': '知识库-删除',
  'knowledge:review': '知识库-审核',
  'user:read': '用户-查看',
  'user:create': '用户-新增',
  'user:update': '用户-编辑',
  'user:delete': '用户-删除',
  'role:create': '角色-新增',
  'role:read': '角色-查看',
  'role:update': '角色-编辑',
  'role:delete': '角色-删除',
  'settings:read': '模型设置-查看',
  'settings:update': '模型设置-编辑',
  'conversation:read': '聊天记录-查看',
  'conversation:delete': '聊天记录-删除',
  'wiki:create': 'Wiki-新增',
  'wiki:read': 'Wiki-查看',
  'wiki:update': 'Wiki-编辑',
  'wiki:delete': 'Wiki-删除',
  'password:change': '修改密码',
};

export default function RoleManagePage() {
  const { toast, confirm } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const canCreate = hasPerm('role:create');
  const canUpdate = hasPerm('role:update');
  const canDelete = hasPerm('role:delete');

  useEffect(() => {
    fetchRoles()
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm(`确定要删除角色"${name}"吗？可在回收站中恢复。`))) return;
    setDeleting(id);
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '删除失败', 'error');
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
          {canCreate && (
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
          )}
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
                  <div className="role-card-actions">
                    {canUpdate && (
                      <Link
                        to={`/roles/edit/${role.id}`}
                        className="role-action-btn"
                        title="编辑权限"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        编辑
                      </Link>
                    )}
                    {canDelete && !isBuiltin && (
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
