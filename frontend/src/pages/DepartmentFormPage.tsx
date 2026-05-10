import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchDepartments,
  fetchDepartment,
  createDepartment,
  updateDepartment,
  type Department,
} from '../services/api';
import './DepartmentFormPage.css';

type DepartmentForm = Omit<Department, 'id' | 'created_at' | 'updated_at'>;

export default function DepartmentFormPage() {
  const { deptId } = useParams();
  const isEdit = !!deptId;
  const navigate = useNavigate();

  const [form, setForm] = useState<DepartmentForm>({
    name: '',
    description: '',
    parent_id: null,
    sort_order: 0,
  });
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    fetchDepartments()
      .then((data) => setAllDepts(data as Department[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    fetchDepartment(deptId!)
      .then((dept) => {
        setForm({
          name: dept.name,
          description: dept.description,
          parent_id: dept.parent_id,
          sort_order: dept.sort_order,
        });
      })
      .catch(() => alert('获取部门详情失败'))
      .finally(() => setLoading(false));
  }, [isEdit, deptId]);

  const updateField = <K extends keyof DepartmentForm>(key: K, value: DepartmentForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateDepartment(deptId!, form);
      } else {
        await createDepartment(form);
      }
      navigate('/departments');
    } catch {
      alert(isEdit ? '更新失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  // Exclude self from parent options to prevent self-reference
  const parentOptions = allDepts.filter((d) => d.id !== deptId);

  if (loading) {
    return (
      <div className="content-area">
        <div className="department-form-page">加载中...</div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="department-form-page">
        <h1 className="dept-form-title">
          {isEdit ? '编辑部门' : '新建部门'}
        </h1>
        <form className="dept-form" onSubmit={handleSubmit}>
          <div className="dept-form-field">
            <label htmlFor="name">部门名称 *</label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="请输入部门名称"
              required
            />
          </div>
          <div className="dept-form-field">
            <label htmlFor="description">部门描述</label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="请输入部门描述（选填）"
              rows={3}
            />
          </div>
          <div className="dept-form-field">
            <label htmlFor="parent">上级部门</label>
            <select
              id="parent"
              value={form.parent_id || ''}
              onChange={(e) => updateField('parent_id', e.target.value || null)}
            >
              <option value="">无（顶级部门）</option>
              {parentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="dept-form-field">
            <label htmlFor="sort_order">排序</label>
            <input
              id="sort_order"
              type="number"
              value={form.sort_order}
              onChange={(e) => updateField('sort_order', parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div className="dept-form-actions">
            <button
              type="button"
              className="dept-form-cancel"
              onClick={() => navigate('/departments')}
            >
              取消
            </button>
            <button
              type="submit"
              className="dept-form-submit"
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
