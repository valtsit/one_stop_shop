import { useEffect, useState } from 'react';
import {
  fetchAdminConversations,
  deleteAdminConversation,
  fetchAdminConversation,
  fetchAdminConversationUsers,
  type AdminConversationSummary,
  type ChatMessage,
} from '../services/api';
import './AdminConversationsPage.css';

export default function AdminConversationsPage() {
  const [conversations, setConversations] = useState<AdminConversationSummary[]>([]);
  const [userOptions, setUserOptions] = useState<{ id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [filterUser, setFilterUser] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [detailConv, setDetailConv] = useState<(AdminConversationSummary & { messages: ChatMessage[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminConversations({
        user_id: filterUser || undefined,
        keyword: filterKeyword || undefined,
      });
      setConversations(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminConversationUsers().then(setUserOptions).catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
  }, [filterUser]);

  const handleSearch = () => {
    loadConversations();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除对话"${title || '新对话'}"吗？`)) return;
    setDeleting(id);
    try {
      await deleteAdminConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (detailConv?.id === id) setDetailConv(null);
    } catch {
      alert('删除失败');
    } finally {
      setDeleting(null);
    }
  };

  const handleViewDetail = async (summary: AdminConversationSummary) => {
    setDetailLoading(true);
    try {
      const conv = await fetchAdminConversation(summary.id);
      setDetailConv({ ...summary, messages: conv.messages });
    } catch {
      alert('获取对话详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="content-area">
      <div className="admin-conv-page">
        <div className="admin-conv-header">
          <div>
            <h1 className="admin-conv-title">历史聊天记录管理</h1>
            <p className="admin-conv-subtitle">查看和管理所有用户的对话记录</p>
          </div>
        </div>

        <div className="admin-conv-filters">
          <select
            className="admin-conv-select"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">全部用户</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
          <input
            className="admin-conv-input"
            placeholder="搜索标题或内容..."
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="admin-conv-search-btn" type="button" onClick={handleSearch}>
            搜索
          </button>
        </div>

        <div className="admin-conv-body">
          <div className="admin-conv-table-area">
            {loading ? (
              <div className="admin-conv-empty">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="admin-conv-empty">暂无对话记录</div>
            ) : (
              <div className="admin-conv-table-wrapper">
                <table className="admin-conv-table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>标题</th>
                      <th>消息数</th>
                      <th>模型</th>
                      <th>创建时间</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations.map((conv) => (
                      <tr
                        key={conv.id}
                        className={detailConv?.id === conv.id ? 'active' : ''}
                        onClick={() => handleViewDetail(conv)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className="admin-conv-user-badge">{conv.user_display_name}</span>
                        </td>
                        <td className="admin-conv-title-cell">{conv.title || '新对话'}</td>
                        <td>{conv.message_count}</td>
                        <td>{conv.model || '-'}</td>
                        <td>{formatDate(conv.created_at)}</td>
                        <td>{formatDate(conv.updated_at)}</td>
                        <td>
                          <div className="admin-conv-actions">
                            <button
                              className="admin-conv-action-btn"
                              onClick={(e) => { e.stopPropagation(); handleViewDetail(conv); }}
                              title="查看详情"
                              type="button"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            <button
                              className="admin-conv-action-btn admin-conv-action-delete"
                              onClick={(e) => { e.stopPropagation(); handleDelete(conv.id, conv.title); }}
                              title="删除"
                              type="button"
                              disabled={deleting === conv.id}
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

          {detailConv && (
            <div className="admin-conv-detail">
              <div className="admin-conv-detail-header">
                <div>
                  <div className="admin-conv-detail-title">{detailConv.title || '新对话'}</div>
                  <div className="admin-conv-detail-meta">
                    <span className="admin-conv-user-badge">{detailConv.user_display_name}</span>
                    <span>{detailConv.model || '-'}</span>
                    <span>{formatDate(detailConv.created_at)}</span>
                  </div>
                </div>
                <button
                  className="admin-conv-detail-close"
                  onClick={() => setDetailConv(null)}
                  type="button"
                >
                  ×
                </button>
              </div>
              <div className="admin-conv-detail-messages">
                {detailLoading ? (
                  <div className="admin-conv-empty">加载中...</div>
                ) : (
                  detailConv.messages.map((msg, i) => (
                    <div key={i} className={`admin-conv-msg admin-conv-msg-${msg.role}`}>
                      <div className="admin-conv-msg-role">{msg.role === 'user' ? '用户' : 'AI'}</div>
                      <div className="admin-conv-msg-content">{msg.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
