import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchUser,
  createUser,
  updateUser,
  fetchRoles,
  fetchDepartments,
  type Role,
  type Department,
} from '../services/api';
import './UserFormPage.css';

interface UserForm {
  username: string;
  password: string;
  display_name: string;
  email: string;
  phone: string;
  role_id: string;
  department_id: string;
  is_active: boolean;
}

export default function UserFormPage() {
  const { userId } = useParams();
  const isEdit = !!userId;
  const navigate = useNavigate();

  const [form, setForm] = useState<UserForm>({
    username: '',
    password: '',
    display_name: '',
    email: '',
    phone: '',
    role_id: '',
    department_id: '',
    is_active: true,
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRoles().then(setRoles).catch(() => {});
    fetchDepartments().then((d) => setDepartments(d as Department[])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    fetchUser(userId!)
      .then((user) => {
        setForm({
          username: user.username,
          password: '',
          display_name: user.display_name,
          email: user.email,
          phone: user.phone,
          role_id: user.role_id,
          department_id: user.department_id,
          is_active: user.is_active,
        });
      })
      .catch(() => setError('获取用户详情失败'))
      .finally(() => setLoading(false));
  }, [isEdit, userId]);

  const updateField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return;
    if (!isEdit && !form.password.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updateUser(userId!, {
          display_name: form.display_name,
          email: form.email,
          phone: form.phone,
          role_id: form.role_id,
          department_id: form.department_id,
          is_active: form.is_active,
        });
      } else {
        await createUser({
          username: form.username,
          password: form.password,
          display_name: form.display_name,
          email: form.email,
          phone: form.phone,
          role_id: form.role_id,
          department_id: form.department_id,
          is_active: form.is_active,
        });
      }
      navigate('/users');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="content-area">
        <div className="user-form-page">加载中...</div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="user-form-page">
        <h1 className="user-form-title">
          {isEdit ? '编辑用户' : '新建用户'}
        </h1>
        {error && <div className="user-form-error">{error}</div>}
        <form className="user-form" onSubmit={handleSubmit}>
          <div className="user-form-field">
            <label htmlFor="username">用户名 *</label>
            <input
              id="username"
              type="text"
              value={form.username}
              onChange={(e) => updateField('username', e.target.value)}
              placeholder="请输入用户名"
              required
              disabled={isEdit}
            />
          </div>
          {!isEdit && (
            <div className="user-form-field">
              <label htmlFor="password">密码 *</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="请输入密码"
                required
              />
            </div>
          )}
          <div className="user-form-field">
            <label htmlFor="display_name">显示名</label>
            <input
              id="display_name"
              type="text"
              value={form.display_name}
              onChange={(e) => updateField('display_name', e.target.value)}
              placeholder="请输入显示名"
            />
          </div>
          <div className="user-form-row">
            <div className="user-form-field">
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="请输入邮箱"
              />
            </div>
            <div className="user-form-field">
              <label htmlFor="phone">手机</label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="请输入手机号"
              />
            </div>
          </div>
          <div className="user-form-row">
            <div className="user-form-field">
              <label htmlFor="role">角色</label>
              <select
                id="role"
                value={form.role_id}
                onChange={(e) => updateField('role_id', e.target.value)}
              >
                <option value="">未分配</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="user-form-field">
              <label htmlFor="department">部门</label>
              <select
                id="department"
                value={form.department_id}
                onChange={(e) => updateField('department_id', e.target.value)}
              >
                <option value="">未分配</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="user-form-field user-form-checkbox">
            <label>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => updateField('is_active', e.target.checked)}
              />
              <span>启用账号</span>
            </label>
          </div>
          <div className="user-form-actions">
            <button
              type="button"
              className="user-form-cancel"
              onClick={() => navigate('/users')}
            >
              取消
            </button>
            <button
              type="submit"
              className="user-form-submit"
              disabled={saving || !form.username.trim() || (!isEdit && !form.password.trim())}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
