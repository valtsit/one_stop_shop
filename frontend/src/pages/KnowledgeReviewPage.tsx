import { useEffect, useState } from 'react';
import { useHasPermission } from '../contexts/AuthContext';
import {
  fetchSubmissions,
  fetchKnowledges,
  approveSubmission,
  rejectSubmission,
  type KnowledgeSubmission,
  type Knowledge,
} from '../services/api';
import './KnowledgeReviewPage.css';

type TabKey = 'pending' | 'approved' | 'rejected' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all', label: '全部' },
];

export default function KnowledgeReviewPage() {
  const hasPerm = useHasPermission();
  const canReview = hasPerm('knowledge:review');
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [submissions, setSubmissions] = useState<KnowledgeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, all: 0 });
  const [allKnowledges, setAllKnowledges] = useState<Knowledge[]>([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [all, pending, approved, rejected] = await Promise.all([
        fetchSubmissions(),
        fetchSubmissions('pending'),
        fetchSubmissions('approved'),
        fetchSubmissions('rejected'),
      ]);
      setCounts({
        all: all.length,
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
      });
      setSubmissions(all);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    fetchKnowledges().then(setAllKnowledges).catch(() => {});
  }, []);

  const filtered = activeTab === 'all'
    ? submissions
    : submissions.filter((s) => s.status === activeTab);

  const handleApprove = async (id: string) => {
    try {
      await approveSubmission(id);
      await loadAll();
    } catch { /* ignore */ }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectSubmission(id, rejectReason);
      setRejectingId(null);
      setRejectReason('');
      await loadAll();
    } catch { /* ignore */ }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="content-area">
      <div className="review-page">
        <div className="review-header">
          <h1>知识库审核</h1>
          <p>审核用户提交的知识库内容</p>
        </div>

        <div className="review-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`review-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
              <span className="tab-count">{counts[tab.key]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="review-empty"><p>加载中...</p></div>
        ) : filtered.length === 0 ? (
          <div className="review-empty">
            <div className="review-empty-icon">
              {activeTab === 'pending' ? '📋' : activeTab === 'approved' ? '✅' : activeTab === 'rejected' ? '❌' : '📭'}
            </div>
            <p>{activeTab === 'pending' ? '暂无待审核内容' : activeTab === 'approved' ? '暂无已通过内容' : activeTab === 'rejected' ? '暂无已拒绝内容' : '暂无提交记录'}</p>
          </div>
        ) : (
          <div className="review-list">
            {filtered.map((sub) => (
              <div key={sub.id} className="review-card">
                <div className="review-card-header">
                  <div className="review-card-user">
                    <div className="review-card-avatar">
                      {(sub.submitted_by_name || '?')[0]}
                    </div>
                    <span className="review-card-name">{sub.submitted_by_name}</span>
                  </div>
                  <div className="review-card-meta">
                    <span className={`review-card-status ${sub.status}`}>
                      {sub.status === 'pending' ? '待审核' : sub.status === 'approved' ? '已通过' : '已拒绝'}
                    </span>
                  </div>
                </div>

                <div className="review-card-action">
                  {sub.action_type === 'create' ? (
                    <>新建条目: <strong>{sub.title || '(无标题)'}</strong></>
                  ) : (
                    <>追加到: <strong>{allKnowledges.find(k => k.id === sub.target_kb_id)?.title || sub.target_kb_id || '(未知)'}</strong></>
                  )}
                </div>

                {sub.row_values && sub.row_values.length > 0 ? (
                  <div className="review-card-text review-card-row">
                    {sub.row_values.map((v, i) => (
                      <span key={i} className="review-card-row-cell">{v || '-'}</span>
                    ))}
                  </div>
                ) : (
                  <div className="review-card-text">{sub.selected_text}</div>
                )}

                {sub.tags.length > 0 && (
                  <div className="review-card-tags">
                    {sub.tags.map((tag, i) => (
                      <span key={i} className="review-card-tag">{tag}</span>
                    ))}
                  </div>
                )}

                <div className="review-card-footer">
                  <span className="review-card-time">{formatDate(sub.created_at)}</span>
                  {canReview && sub.status === 'pending' && (
                    <div className="review-card-actions">
                      <button
                        className="review-approve-btn"
                        type="button"
                        onClick={() => handleApprove(sub.id)}
                      >通过</button>
                      <button
                        className="review-reject-btn"
                        type="button"
                        onClick={() => {
                          setRejectingId(rejectingId === sub.id ? null : sub.id);
                          setRejectReason('');
                        }}
                      >拒绝</button>
                    </div>
                  )}
                </div>

                {canReview && rejectingId === sub.id && (
                  <div className="review-reject-form">
                    <input
                      className="review-reject-input"
                      type="text"
                      placeholder="拒绝原因（可选）"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      maxLength={200}
                      autoFocus
                    />
                    <button
                      className="review-reject-confirm"
                      type="button"
                      onClick={() => handleReject(sub.id)}
                    >确认拒绝</button>
                  </div>
                )}

                {sub.status === 'rejected' && sub.reject_reason && (
                  <div className="review-reject-reason">拒绝原因: {sub.reject_reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
