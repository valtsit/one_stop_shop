import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchRole,
  createRole,
  updateRole,
} from '../services/api';
import './RoleFormPage.css';

interface RoleForm {
  name: string;
  description: string;
  permissions: string[];
}

const AVAILABLE_PERMISSIONS = [
  { value: 'department:create', label: '创建部门' },
  { value: 'department:read', label: '查看部门' },
  { value: 'department:update', label: '编辑部门' },
  { value: 'department:delete', label: '删除部门' },
  { value: 'user:manage', label: '用户管理' },
  { value: 'agent:manage', label: '智能体管理' },
];

export default function RoleFormPage() {
  const { roleId } = useParams();
  const isEdit = !!roleId;
  const navigate = useNavigate();

  const [form, setForm] = useState<RoleForm>({
    name: '',
    description: '',
    permissions: [],
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    fetchRole(roleId!)
      .then((role) => {
        setForm({
          name: role.name,
          description: role.description,
          permissions: role.permissions,
        });
      })
      .catch(() => setError('获取角色详情失败'))
      .finally(() => setLoading(false));
  }, [isEdit, roleId]);

  const togglePermission = (perm: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (isEdit && roleId) {
        await updateRole(roleId, form);
      } else {
        await createRole(form);
      }
      navigate('/roles');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="content-area">
        <div className="role-form-page">加载中...</div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="role-form-page">
        <h1 className="role-form-title">
          {isEdit ? '编辑角色' : '新建角色'}
        </h1>
        {error && <div className="role-form-error">{error}</div>}
        <form className="role-form" onSubmit={handleSubmit}>
          <div className="role-form-field">
            <label htmlFor="name">角色名称 *</label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="请输入角色名称"
              required
            />
          </div>
          <div className="role-form-field">
            <label htmlFor="description">角色描述</label>
            <input
              id="description"
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="请输入角色描述"
            />
          </div>
          <div className="role-form-field">
            <label>权限配置</label>
            <div className="role-perm-list">
              {AVAILABLE_PERMISSIONS.map((perm) => (
                <label key={perm.value} className="role-perm-item">
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(perm.value)}
                    onChange={() => togglePermission(perm.value)}
                  />
                  <span>{perm.label}</span>
                  <code>{perm.value}</code>
                </label>
              ))}
            </div>
          </div>
          <div className="role-form-actions">
            <button
              type="button"
              className="role-form-cancel"
              onClick={() => navigate('/roles')}
            >
              取消
            </button>
            <button
              type="submit"
              className="role-form-submit"
              disabled={saving || !form.name.trim()}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
