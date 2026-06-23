import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchUsers, deleteUser, resetUserPassword, fetchRoles, fetchDepartments, type User, type Role, type Department } from '../services/api';
import { useToast } from '../hooks/useToast';
import './UserManagePage.css';

export default function UserManagePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast, confirm } = useToast();

  useEffect(() => {
    Promise.all([
      fetchUsers().then(setUsers),
      fetchRoles().then(setRoles),
      fetchDepartments().then((d) => setDepartments(d as Department[])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name || roleId;
  const getDeptName = (deptId: string) => departments.find((d) => d.id === deptId)?.name || deptId;

  const handleDelete = async (id: string, username: string) => {
    if (!(await confirm(`确定要删除用户"${username}"吗？可在回收站中恢复。`))) return;
    setDeleting(id);
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleResetPassword = async (id: string, username: string) => {
    const newPwd = prompt(`请输入用户"${username}"的新密码：`);
    if (!newPwd) return;
    try {
      await resetUserPassword(id, newPwd);
      toast('密码已重置', 'success');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '重置密码失败', 'error');
    }
  };

  return (
    <div className="content-area">
      <div className="user-manage-page">
        <div className="user-header">
          <div>
            <h1 className="user-title">用户管理</h1>
            <p className="user-subtitle">管理系统用户账号和权限</p>
          </div>
          <button
            className="user-create-btn"
            onClick={() => navigate('/users/create')}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建用户
          </button>
        </div>

        {loading ? (
          <div className="user-empty">加载中...</div>
        ) : users.length === 0 ? (
          <div className="user-empty">
            <p>还没有用户</p>
            <button
              className="user-create-btn"
              onClick={() => navigate('/users/create')}
              type="button"
            >
              创建第一个用户
            </button>
          </div>
        ) : (
          <div className="user-table-wrapper">
            <table className="user-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>显示名</th>
                  <th>邮箱</th>
                  <th>手机</th>
                  <th>角色</th>
                  <th>部门</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="user-table-username">{user.username}</td>
                    <td>{user.display_name || '-'}</td>
                    <td>{user.email || '-'}</td>
                    <td>{user.phone || '-'}</td>
                    <td>
                      <span className="user-badge">{getRoleName(user.role_id) || '-'}</span>
                    </td>
                    <td>{getDeptName(user.department_id) || '-'}</td>
                    <td>
                      <span className={`user-status ${user.is_active ? 'active' : 'inactive'}`}>
                        {user.is_active ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td>
                      <div className="user-actions">
                        <Link
                          to={`/users/edit/${user.id}`}
                          className="user-action-btn"
                          title="编辑"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </Link>
                        <button
                          className="user-action-btn"
                          onClick={() => handleResetPassword(user.id, user.username)}
                          title="重置密码"
                          type="button"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </button>
                        <button
                          className="user-action-btn user-action-delete"
                          onClick={() => handleDelete(user.id, user.username)}
                          title="删除"
                          type="button"
                          disabled={deleting === user.id}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
