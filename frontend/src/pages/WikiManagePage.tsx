import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWikiSpaces, deleteWikiSpace, createWikiSpace, updateWikiSpace, type WikiSpace } from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './WikiShared.css';
import './WikiManagePage.css';

export default function WikiManagePage() {
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const { toast, confirm } = useToast();
  const canCreate = hasPerm('wiki:create');
  const canUpdate = hasPerm('wiki:update');
  const canDelete = hasPerm('wiki:delete');

  const [spaces, setSpaces] = useState<WikiSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchWikiSpaces()
      .then(setSpaces)
      .catch(() => { setError(true); })
      .finally(() => { setLoading(false); });
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const space = await createWikiSpace({ name: newName.trim(), description: newDesc.trim() });
      setSpaces((prev) => [space, ...prev]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      toast('空间创建成功', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm(`确定删除知识空间"${name}"吗？其中所有页面和资料将被永久删除。`))) return;
    setDeleting(id);
    try {
      await deleteWikiSpace(id);
      setSpaces((prev) => prev.filter((s) => s.id !== id));
      toast('已删除', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const openEdit = (s: WikiSpace) => {
    setEditId(s.id);
    setEditName(s.name);
    setEditDesc(s.description || '');
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!editName.trim()) return;
    setEditing(true);
    try {
      const updated = await updateWikiSpace(editId, { name: editName.trim(), description: editDesc.trim() });
      setSpaces((prev) => prev.map((s) => (s.id === editId ? updated : s)));
      setShowEdit(false);
      toast('已更新', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '更新失败', 'error');
    } finally {
      setEditing(false);
    }
  };

  const filtered = spaces.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  return (
    <div className="content-area">
      <div className="wiki-manage-page">
        <div className="wiki-manage-header">
          <div>
            <h1>Wiki 知识库</h1>
            <p>基于 LLM Wiki 理论的体系化知识管理</p>
          </div>
          {canCreate && (
            <button className="wiki-create-btn" type="button" onClick={() => setShowCreate(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>新建空间</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="wiki-loading"><div className="wiki-spinner" /> 加载中...</div>
        ) : error ? (
          <div className="wiki-empty">
            <p>加载失败，请刷新重试</p>
          </div>
        ) : (
          <>
            {spaces.length > 0 && (
              <div className="wiki-search-bar">
                <input
                  type="text"
                  placeholder="搜索知识空间..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="wiki-empty">
                <p>{spaces.length === 0 ? '还没有创建任何知识空间' : '没有匹配的结果'}</p>
                {spaces.length === 0 && canCreate && (
                  <button className="wiki-create-btn" type="button" onClick={() => setShowCreate(true)}>
                    创建第一个空间
                  </button>
                )}
              </div>
            ) : (
              <div className="wiki-grid">
                {filtered.map((space) => (
                  <div key={space.id} className="wiki-card" onClick={() => navigate(`/wiki/${space.id}`)}>
                    <div className="wiki-card-info">
                      <div className="wiki-card-name">{space.name}</div>
                      {space.description && <div className="wiki-card-desc">{space.description}</div>}
                      <div className="wiki-card-meta">
                        <span>{new Date(space.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {(canUpdate || canDelete) && (
                      <div className="wiki-card-actions">
                        {canUpdate && (
                          <button
                            className="wiki-card-edit"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(space); }}
                          >
                            编辑
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="wiki-card-delete"
                            type="button"
                            disabled={deleting === space.id}
                            onClick={(e) => { e.stopPropagation(); handleDelete(space.id, space.name); }}
                          >
                            {deleting === space.id ? '删除中...' : '删除'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="wiki-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="wiki-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wiki-modal-header">
              <h2>新建知识空间</h2>
              <button className="wiki-modal-close" onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <div className="wiki-modal-body">
              <div className="wiki-form-group">
                <label>空间名称</label>
                <input
                  type="text"
                  placeholder="例如：产品知识库、技术文档..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="wiki-form-group">
                <label>描述</label>
                <textarea
                  placeholder="简要描述这个知识空间的用途..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="wiki-modal-footer">
              <button className="wiki-btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
              <button className="wiki-btn-primary" onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="wiki-modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="wiki-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wiki-modal-header">
              <h2>编辑知识空间</h2>
              <button className="wiki-modal-close" onClick={() => setShowEdit(false)}>&times;</button>
            </div>
            <div className="wiki-modal-body">
              <div className="wiki-form-group">
                <label>空间名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="wiki-form-group">
                <label>描述</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="wiki-modal-footer">
              <button className="wiki-btn-secondary" onClick={() => setShowEdit(false)}>取消</button>
              <button className="wiki-btn-primary" onClick={handleEdit} disabled={!editName.trim() || editing}>
                {editing ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
