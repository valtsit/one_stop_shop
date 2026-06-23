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

interface ModulePerm {
  key: string;
  label: string;
  actions: { key: string; label: string }[];
}

const MODULE_PERMISSIONS: ModulePerm[] = [
  {
    key: 'department',
    label: '部门管理',
    actions: [
      { key: 'create', label: '新增' },
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
    ],
  },
  {
    key: 'agent',
    label: '智能体',
    actions: [
      { key: 'create', label: '新增' },
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
    ],
  },
  {
    key: 'skill',
    label: 'Skill',
    actions: [
      { key: 'create', label: '新增' },
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
    ],
  },
  {
    key: 'knowledge',
    label: '知识库',
    actions: [
      { key: 'create', label: '新增' },
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
      { key: 'review', label: '审核' },
    ],
  },
  {
    key: 'user',
    label: '用户',
    actions: [
      { key: 'read', label: '查看' },
      { key: 'create', label: '新增' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
    ],
  },
  {
    key: 'role',
    label: '角色',
    actions: [
      { key: 'create', label: '新增' },
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
    ],
  },
  {
    key: 'settings',
    label: '模型设置',
    actions: [
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
    ],
  },
  {
    key: 'conversation',
    label: '聊天记录',
    actions: [
      { key: 'read', label: '查看' },
      { key: 'delete', label: '删除' },
    ],
  },
  {
    key: 'wiki',
    label: 'Wiki 知识库',
    actions: [
      { key: 'create', label: '新增' },
      { key: 'read', label: '查看' },
      { key: 'update', label: '编辑' },
      { key: 'delete', label: '删除' },
    ],
  },
];

export default function RoleFormPage() {
  const { roleId } = useParams();
  const isEdit = !!roleId;
  const isBuiltin = roleId && ['role_super_admin', 'role_admin', 'role_user'].includes(roleId);
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

  const isModuleFullyChecked = (mod: ModulePerm) =>
    mod.actions.every((a) => form.permissions.includes(`${mod.key}:${a.key}`));

  const toggleModule = (mod: ModulePerm) => {
    const allChecked = isModuleFullyChecked(mod);
    const permStrings = mod.actions.map((a) => `${mod.key}:${a.key}`);
    setForm((prev) => ({
      ...prev,
      permissions: allChecked
        ? prev.permissions.filter((p) => !permStrings.includes(p))
        : [...new Set([...prev.permissions, ...permStrings])],
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
              disabled={!!isBuiltin}
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
              {MODULE_PERMISSIONS.map((mod) => (
                <div key={mod.key} className="role-perm-row">
                  <span className="role-perm-module">{mod.label}</span>
                  <div className="role-perm-actions">
                    {mod.actions.map((a) => (
                      <label key={a.key} className="role-perm-item">
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(`${mod.key}:${a.key}`)}
                          onChange={() => togglePermission(`${mod.key}:${a.key}`)}
                        />
                        <span>{a.label}</span>
                      </label>
                    ))}
                    <label className="role-perm-item role-perm-all">
                      <input
                        type="checkbox"
                        checked={isModuleFullyChecked(mod)}
                        onChange={() => toggleModule(mod)}
                      />
                      <span>全选</span>
                    </label>
                  </div>
                </div>
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
