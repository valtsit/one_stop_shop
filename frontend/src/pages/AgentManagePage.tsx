import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAgents, deleteAgent, type Agent } from '../services/api';
import { useHasPermission } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import './AgentManagePage.css';

const CATEGORY_LABELS: Record<string, string> = {
  general: '通用',
  management: '管理工具',
  ecommerce: '电商工具',
  design: '设计工具',
  xiaohongshu: '小红书工具',
  business_coach: '商业教练',
  caishui: '财税工具',
};

export default function AgentManagePage() {
  const navigate = useNavigate();
  const hasPerm = useHasPermission();
  const { confirm } = useToast();
  const canCreate = hasPerm('agent:create');
  const canUpdate = hasPerm('agent:update');
  const canDelete = hasPerm('agent:delete');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadAgents = () => {
    fetchAgents().then(setAgents).catch(() => {});
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm(`确定删除智能体"${name}"吗？可在回收站中恢复。`))) return;
    setDeleting(id);
    try {
      await deleteAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="content-area">
      <div className="agent-manage-page">
        <div className="agent-manage-header">
          <div>
            <h1>智能体管理</h1>
            <p>{canCreate ? '创建和管理你的自定义智能体' : '查看可用的智能体'}</p>
          </div>
          {canCreate && (
            <button
              className="create-agent-btn"
              type="button"
              onClick={() => navigate('/agents/create')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>创建智能体</span>
            </button>
          )}
        </div>

        {agents.length === 0 ? (
          <div className="agent-empty">
            <div className="agent-empty-icon">🤖</div>
            <p>{canCreate ? '还没有创建任何智能体' : '暂无可用的智能体'}</p>
            {canCreate && (
              <button className="create-agent-btn" type="button" onClick={() => navigate('/agents/create')}>
                创建第一个智能体
              </button>
            )}
          </div>
        ) : (
          <div className="agent-grid">
            {agents.map((agent) => (
              <div key={agent.id} className="agent-card">
                <div className="agent-card-top">
                  <div className="agent-card-icon" style={{ background: agent.icon_bg_color, color: agent.icon_color }}>
                    {agent.icon}
                  </div>
                  <div className="agent-card-info">
                    <span className="agent-card-name">{agent.name}</span>
                    <span className="agent-card-category">{CATEGORY_LABELS[agent.category] || agent.category}</span>
                  </div>
                </div>
                <p className="agent-card-desc">{agent.description}</p>
                {agent.suggestions.length > 0 && (
                  <div className="agent-card-tags">
                    {agent.suggestions.slice(0, 3).map((s, i) => (
                      <span key={i} className="agent-card-tag">{s}</span>
                    ))}
                  </div>
                )}
                <div className="agent-card-actions">
                  {canUpdate && (
                    <button
                      className="agent-action-btn edit"
                      type="button"
                      onClick={() => navigate(`/agents/edit/${agent.id}`)}
                    >
                      编辑
                    </button>
                  )}
                  <button
                    className="agent-action-btn chat"
                    type="button"
                    onClick={() => navigate(`/chat/${agent.id}`)}
                  >
                    对话
                  </button>
                  {canDelete && (
                    <button
                      className="agent-action-btn delete"
                      type="button"
                      disabled={deleting === agent.id}
                      onClick={() => handleDelete(agent.id, agent.name)}
                    >
                      {deleting === agent.id ? '删除中...' : '删除'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
