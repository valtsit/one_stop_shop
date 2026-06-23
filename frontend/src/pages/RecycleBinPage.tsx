import { useEffect, useState } from 'react';
import {
  fetchRecycleBin,
  restoreRecycleBinItem,
  deleteRecycleBinItem,
  clearRecycleBin,
  type RecycleBinItem,
} from '../services/api';
import { useToast } from '../hooks/useToast';
import './RecycleBinPage.css';

const ENTITY_TYPES = [
  { key: '', label: '全部' },
  { key: 'agent', label: '智能体' },
  { key: 'skill', label: 'Skill' },
  { key: 'knowledge', label: '知识库' },
  { key: 'wiki', label: 'Wiki 知识库' },
  { key: 'role', label: '角色' },
  { key: 'department', label: '部门' },
  { key: 'user', label: '用户' },
];

const ENTITY_LABELS: Record<string, string> = {
  agent: '智能体',
  skill: 'Skill',
  knowledge: '知识库',
  wiki: 'Wiki 知识库',
  role: '角色',
  department: '部门',
  user: '用户',
};

function formatDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function daysRemaining(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function RecycleBinPage() {
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [operating, setOperating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchRecycleBin(filter || undefined);
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const handleRestore = async (item: RecycleBinItem) => {
    if (!(await confirm(`确定恢复"${item.entity_name}"吗？`))) return;
    setOperating(item.id);
    try {
      await restoreRecycleBinItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : '恢复失败', 'error');
    } finally {
      setOperating(null);
    }
  };

  const handleDelete = async (item: RecycleBinItem) => {
    if (!(await confirm(`确定永久删除"${item.entity_name}"吗？此操作不可恢复！`))) return;
    setOperating(item.id);
    try {
      await deleteRecycleBinItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : '永久删除失败', 'error');
    } finally {
      setOperating(null);
    }
  };

  const handleClear = async () => {
    const label = filter ? ENTITY_LABELS[filter] || filter : '全部';
    if (!(await confirm(`确定清空${label}回收站吗？所有数据将永久删除，不可恢复！`))) return;
    try {
      await clearRecycleBin(filter || undefined);
      setItems([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : '清空失败', 'error');
    }
  };

  return (
    <div className="rb-page">
      <div className="rb-header">
        <h1>回收站</h1>
        {items.length > 0 && (
          <div className="rb-header-actions">
            <button className="rb-clear-btn" onClick={handleClear}>
              清空回收站
            </button>
          </div>
        )}
      </div>

      <div className="rb-tabs">
        {ENTITY_TYPES.map((t) => (
          <button
            key={t.key}
            className={`rb-tab ${filter === t.key ? 'active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rb-empty">
          <p>加载中...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rb-empty">
          <div className="rb-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48 }}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </div>
          <p>回收站是空的</p>
        </div>
      ) : (
        <div className="rb-table-wrap">
          <table className="rb-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>删除时间</th>
                <th>过期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const days = daysRemaining(item.expires_at);
                return (
                  <tr key={item.id}>
                    <td>{item.entity_name || item.entity_id}</td>
                    <td>
                      <span className={`rb-entity-type-badge ${item.entity_type}`}>
                        {ENTITY_LABELS[item.entity_type] || item.entity_type}
                      </span>
                    </td>
                    <td>{formatDate(item.deleted_at)}</td>
                    <td>
                      <span className={`rb-expire-tag ${days <= 3 ? 'urgent' : ''}`}>
                        {days <= 0 ? '已过期' : `${days}天后过期`}
                      </span>
                    </td>
                    <td>
                      <div className="rb-actions">
                        <button
                          className="rb-restore-btn"
                          onClick={() => handleRestore(item)}
                          disabled={operating === item.id}
                        >
                          {operating === item.id ? '处理中...' : '恢复'}
                        </button>
                        <button
                          className="rb-delete-btn"
                          onClick={() => handleDelete(item)}
                          disabled={operating === item.id}
                        >
                          永久删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
