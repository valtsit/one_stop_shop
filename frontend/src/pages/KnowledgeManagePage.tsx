import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchKnowledges, deleteKnowledge, type Knowledge } from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './KnowledgeManagePage.css';

export default function KnowledgeManagePage() {
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const { confirm } = useToast();
  const canCreate = hasPerm('knowledge:create');
  const canUpdate = hasPerm('knowledge:update');
  const canDelete = hasPerm('knowledge:delete');
  const [items, setItems] = useState<Knowledge[]>([]);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<Knowledge | null>(null);

  useEffect(() => {
    fetchKnowledges().then(setItems).catch(() => {});
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirm(`确定删除"${title}"吗？可在回收站中恢复。`))) return;
    setDeleting(id);
    try {
      await deleteKnowledge(id);
      setItems((prev) => prev.filter((k) => k.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const filtered = items.filter((k) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return k.title.toLowerCase().includes(q) || k.tags.some((t) => t.toLowerCase().includes(q));
  });

  return (
    <div className="content-area">
      <div className="kb-manage-page">
        <div className="kb-manage-header">
          <div>
            <h1>知识库</h1>
            <p>收藏和管理优秀文案</p>
          </div>
          {canCreate && (
            <button className="create-kb-btn" type="button" onClick={() => navigate('/knowledge/create')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>新建条目</span>
            </button>
          )}
        </div>

        {items.length > 0 && (
          <div className="kb-search-bar">
            <input
              type="text"
              placeholder="搜索标题或标签..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="kb-empty">
            <div className="kb-empty-icon">📚</div>
            <p>{items.length === 0 ? '还没有收藏任何内容' : '没有匹配的结果'}</p>
            {items.length === 0 && canCreate && (
              <button className="create-kb-btn" type="button" onClick={() => navigate('/knowledge/create')}>
                创建第一条
              </button>
            )}
          </div>
        ) : (
          <div className="kb-grid">
            {filtered.map((item) => (
              <div key={item.id} className="kb-card" onDoubleClick={() => setPreview(item)}>
                <div className="kb-card-title">
                  {item.title}
                  {item.skip_review && <span className="kb-badge-skip-review">免审核</span>}
                </div>
                {item.tags.length > 0 && (
                  <div className="kb-card-tags">
                    {item.tags.map((tag, i) => (
                      <span key={i} className="kb-tag-chip">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="kb-card-content-preview">
                  {item.format === 'table' && item.columns?.length
                    ? `${item.columns.join(' | ')}（${item.rows?.length || 0} 行）`
                    : item.content.length > 80 ? item.content.slice(0, 80) + '...' : item.content || '暂无内容'
                  }
                </div>
                <div className="kb-card-meta">
                  <span>{item.content.length} 字</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                <div className="kb-card-actions">
                  {(canUpdate || item.skip_review) && (
                    <button className="kb-action-btn edit" type="button" onClick={() => navigate(`/knowledge/edit/${item.id}`)}>
                      编辑
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="kb-action-btn delete"
                      type="button"
                      disabled={deleting === item.id}
                      onClick={() => handleDelete(item.id, item.title)}
                    >
                      {deleting === item.id ? '删除中...' : '删除'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {preview && (
        <div className="kb-preview-overlay" onClick={() => setPreview(null)}>
          <div className="kb-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="kb-preview-header">
              <h2>{preview.title}</h2>
              <button className="kb-preview-close" onClick={() => setPreview(null)}>&times;</button>
            </div>
            {preview.tags.length > 0 && (
              <div className="kb-preview-tags">
                {preview.tags.map((tag, i) => (
                  <span key={i} className="kb-tag-chip">{tag}</span>
                ))}
              </div>
            )}
            <div className="kb-preview-body">
              {preview.format === 'table' && preview.columns?.length ? (
                <table className="kb-preview-table">
                  <thead>
                    <tr>{preview.columns.map((col, i) => <th key={i}>{col}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(preview.rows || []).map((row, ri) => (
                      <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre className="kb-preview-text">{preview.content || '暂无内容'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
