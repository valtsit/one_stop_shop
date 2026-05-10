import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDepartments, deleteDepartment, type DepartmentTree } from '../services/api';
import './DepartmentManagePage.css';

function DeptTreeNode({
  dept,
  depth,
  onDelete,
}: {
  dept: DepartmentTree;
  depth: number;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="dept-tree-node" style={{ marginLeft: depth > 0 ? 32 : 0 }}>
      <div className="dept-card">
        <div className="dept-card-info">
          <span className="dept-card-icon">
            {depth === 0 ? '🏢' : '📁'}
          </span>
          <div>
            <div className="dept-card-name">{dept.name}</div>
            {dept.description && (
              <div className="dept-card-desc">{dept.description}</div>
            )}
          </div>
        </div>
        <div className="dept-card-actions">
          <Link
            to={`/departments/edit/${dept.id}`}
            className="dept-action-btn"
            title="编辑"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </Link>
          <button
            className="dept-action-btn dept-action-delete"
            onClick={() => onDelete(dept.id, dept.name)}
            title="删除"
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
      {dept.children.length > 0 && (
        <div className="dept-tree-children">
          {dept.children.map((child) => (
            <DeptTreeNode key={child.id} dept={child} depth={depth + 1} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DepartmentManagePage() {
  const [departments, setDepartments] = useState<DepartmentTree[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDepartments(true)
      .then((data) => setDepartments(data as DepartmentTree[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除部门"${name}"吗？子部门将被提升为顶级部门。`)) return;
    try {
      await deleteDepartment(id);
      setDepartments((prev) => {
        const remove = (nodes: DepartmentTree[]): DepartmentTree[] =>
          nodes
            .filter((n) => n.id !== id)
            .map((n) => ({ ...n, children: remove(n.children) }));
        return remove(prev);
      });
    } catch {
      alert('删除失败');
    }
  };

  return (
    <div className="content-area">
      <div className="department-manage-page">
        <div className="dept-header">
          <div>
            <h1 className="dept-title">部门管理</h1>
            <p className="dept-subtitle">管理组织架构和部门层级</p>
          </div>
          <button
            className="dept-create-btn"
            onClick={() => navigate('/departments/create')}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建部门
          </button>
        </div>

        {loading ? (
          <div className="dept-empty">加载中...</div>
        ) : departments.length === 0 ? (
          <div className="dept-empty">
            <p>还没有部门</p>
            <button
              className="dept-create-btn"
              onClick={() => navigate('/departments/create')}
              type="button"
            >
              创建第一个部门
            </button>
          </div>
        ) : (
          <div className="dept-tree">
            {departments.map((dept) => (
              <DeptTreeNode key={dept.id} dept={dept} depth={0} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
